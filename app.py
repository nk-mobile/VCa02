from flask import Flask, render_template, request, jsonify, send_file
import math
import io
from datetime import datetime

app = Flask(__name__)

def calculate_schedule(principal, years, interest_rate, prepayment_amount=0.0, prepayment_month=None, prepayment_strategy='reduce_term'):
    """
    Рассчитывает график выплат по аннуитетной схеме с поддержкой нулевой ставки и досрочного платежа.

    Args:
        principal (float): Тело кредита
        years (int): Срок в годах
        interest_rate (float): Годовая ставка, %
        prepayment_amount (float): Сумма досрочного платежа (опционально)
        prepayment_month (int|None): Номер месяца для досрочного платежа (1..N)
        prepayment_strategy (str): 'reduce_payment' или 'reduce_term'

    Returns:
        dict: {'schedule': [...], 'monthly_payment': float, 'total_interest': float, 'total_paid': float}
    """
    months_total = years * 12
    monthly_rate = interest_rate / 100 / 12

    schedule = []

    if monthly_rate == 0:
        # Без процентов: равномерное погашение principal/месяц
        base_monthly_principal = principal / months_total
        monthly_payment = base_monthly_principal
        remaining = principal
        total_interest = 0.0
        for m in range(1, months_total + 1):
            interest = 0.0
            principal_payment = min(base_monthly_principal, remaining)
            # Досрочный платёж
            extra = 0.0
            if prepayment_amount > 0 and prepayment_month == m:
                extra = min(prepayment_amount, max(remaining - principal_payment, 0))
            total_payment = principal_payment + extra
            remaining = max(remaining - principal_payment - extra, 0)

            schedule.append({
                'month': m,
                'payment': round(total_payment, 2),
                'interest': round(interest, 2),
                'principal': round(principal_payment + extra, 2),
                'remaining': round(remaining, 2)
            })
            if remaining <= 1e-6:
                break
        total_paid = sum(item['payment'] for item in schedule)
        return {
            'schedule': schedule,
            'monthly_payment': round(monthly_payment, 2),
            'total_interest': round(total_interest, 2),
            'total_paid': round(total_paid, 2)
        }

    # Аннуитетная схема
    # Базовый ежемесячный платёж до досрочного погашения
    monthly_payment = principal * (monthly_rate * (1 + monthly_rate) ** months_total) / ((1 + monthly_rate) ** months_total - 1)

    remaining = principal
    total_interest = 0.0
    m = 1
    while m <= months_total and remaining > 1e-8:
        interest = remaining * monthly_rate
        principal_payment = monthly_payment - interest
        if principal_payment < 0:
            principal_payment = 0

        # Досрочный платёж
        extra = 0.0
        if prepayment_amount > 0 and prepayment_month == m:
            # Ограничиваем досрочку остатком после основного платежа текущего месяца
            affordable_extra = max(remaining - principal_payment, 0)
            extra = min(prepayment_amount, affordable_extra)

            if prepayment_strategy == 'reduce_payment':
                # Уменьшаем платёж, срок прежний: пересчитываем платёж на остаток после досрочки
                new_remaining = max(remaining - principal_payment - extra, 0)
                months_left = months_total - m
                if months_left > 0 and new_remaining > 0:
                    monthly_payment = new_remaining * (monthly_rate * (1 + monthly_rate) ** months_left) / ((1 + monthly_rate) ** months_left - 1)
            else:
                # reduce_term: платёж прежний, срок сократится естественно
                pass

        total_payment = principal_payment + interest + extra
        total_interest += interest
        remaining = max(remaining - principal_payment - extra, 0)

        schedule.append({
            'month': m,
            'payment': round(total_payment, 2),
            'interest': round(interest, 2),
            'principal': round(principal_payment + extra, 2),
            'remaining': round(remaining, 2)
        })

        # Если остаток меньше будущего principal платежа — завершаем раньше
        if remaining <= 1e-6:
            break
        m += 1

    total_paid = sum(item['payment'] for item in schedule)
    return {
        'schedule': schedule,
        'monthly_payment': round(schedule[0]['payment'] if schedule else 0, 2) if monthly_rate == 0 else round(monthly_payment, 2),
        'total_interest': round(total_interest, 2),
        'total_paid': round(total_paid, 2)
    }


def calculate_mortgage_core(loan_amount, years, interest_rate, down_payment=0.0, prepayment_amount=0.0, prepayment_month=None, prepayment_strategy='reduce_term'):
    principal = loan_amount - down_payment
    schedule_data = calculate_schedule(
        principal=principal,
        years=years,
        interest_rate=interest_rate,
        prepayment_amount=prepayment_amount,
        prepayment_month=prepayment_month,
        prepayment_strategy=prepayment_strategy
    )

    total_amount_payments = schedule_data['total_paid']
    overpayment = schedule_data['total_interest']
    cash_total = total_amount_payments + down_payment

    return {
        'monthly_payment': schedule_data['monthly_payment'],
        'total_amount_payments': round(total_amount_payments, 2),
        'overpayment': round(overpayment, 2),
        'loan_amount': round(loan_amount, 2),
        'down_payment': round(down_payment, 2),
        'principal': round(principal, 2),
        'years': years,
        'interest_rate': interest_rate,
        'cash_total': round(cash_total, 2),
        'schedule': schedule_data['schedule']
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        data = request.get_json()

        loan_amount = float(data.get('loan_amount', 0))
        years = int(data.get('years', 0))
        interest_rate = float(data.get('interest_rate', 0))
        down_payment = float(data.get('down_payment', 0))

        is_installment = bool(data.get('is_installment', False))
        if is_installment:
            interest_rate = 0.0

        prepayment_amount = float(data.get('prepayment_amount', 0) or 0)
        prepayment_month = data.get('prepayment_month', None)
        prepayment_month = int(prepayment_month) if prepayment_month not in (None, "",) else None
        prepayment_strategy = data.get('prepayment_strategy', 'reduce_term')
        if prepayment_strategy not in ('reduce_term', 'reduce_payment'):
            prepayment_strategy = 'reduce_term'

        if loan_amount <= 0:
            return jsonify({'error': 'Сумма недвижимости должна быть больше 0'}), 400
        if years <= 0 or years > 50:
            return jsonify({'error': 'Срок кредита должен быть от 1 до 50 лет'}), 400
        if interest_rate < 0 or interest_rate > 100:
            return jsonify({'error': 'Процентная ставка должна быть от 0% до 100%'}), 400
        if down_payment < 0:
            return jsonify({'error': 'Первоначальный взнос не может быть отрицательным'}), 400
        if down_payment >= loan_amount:
            return jsonify({'error': 'Первоначальный взнос должен быть меньше суммы недвижимости'}), 400
        if prepayment_amount < 0:
            return jsonify({'error': 'Сумма досрочного платежа не может быть отрицательной'}), 400
        if prepayment_month is not None and (prepayment_month < 1 or prepayment_month > years * 12):
            return jsonify({'error': 'Месяц досрочного платежа вне допустимого диапазона'}), 400

        result = calculate_mortgage_core(
            loan_amount=loan_amount,
            years=years,
            interest_rate=interest_rate,
            down_payment=down_payment,
            prepayment_amount=prepayment_amount,
            prepayment_month=prepayment_month,
            prepayment_strategy=prepayment_strategy,
        )
        return jsonify(result)

    except (ValueError, TypeError):
        return jsonify({'error': 'Некорректные входные данные'}), 400
    except Exception:
        return jsonify({'error': 'Ошибка при расчете'}), 500


@app.route('/export', methods=['POST'])
def export_excel():
    try:
        data = request.get_json()

        loan_amount = float(data.get('loan_amount', 0))
        years = int(data.get('years', 0))
        interest_rate = float(data.get('interest_rate', 0))
        down_payment = float(data.get('down_payment', 0))
        is_installment = bool(data.get('is_installment', False))
        if is_installment:
            interest_rate = 0.0
        prepayment_amount = float(data.get('prepayment_amount', 0) or 0)
        prepayment_month = data.get('prepayment_month', None)
        prepayment_month = int(prepayment_month) if prepayment_month not in (None, "",) else None
        prepayment_strategy = data.get('prepayment_strategy', 'reduce_term')

        result = calculate_mortgage_core(
            loan_amount=loan_amount,
            years=years,
            interest_rate=interest_rate,
            down_payment=down_payment,
            prepayment_amount=prepayment_amount,
            prepayment_month=prepayment_month,
            prepayment_strategy=prepayment_strategy,
        )

        # Генерация Excel через openpyxl (без внешних импортов здесь — создадим вручную простую таблицу CSV-совместимым способом)
        # Для совместимости без дополнительных зависимостей создадим CSV в памяти
        import csv
        output = io.StringIO()
        writer = csv.writer(output, delimiter=';')
        writer.writerow(['Месяц', 'Платеж', 'Проценты', 'Основной долг', 'Остаток'])
        for row in result['schedule']:
            writer.writerow([
                row['month'],
                row['payment'],
                row['interest'],
                row['principal'],
                row['remaining']
            ])
        writer.writerow([])
        writer.writerow(['Ежемесячный платеж', result['monthly_payment']])
        writer.writerow(['Переплата (проценты)', result['overpayment']])
        writer.writerow(['Всего выплачено по кредиту', result['total_amount_payments']])
        writer.writerow(['Итого (с учетом взноса)', result['cash_total']])

        mem = io.BytesIO()
        mem.write(output.getvalue().encode('utf-8-sig'))
        mem.seek(0)
        filename = f"mortgage_schedule_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        return send_file(mem, as_attachment=True, download_name=filename, mimetype='text/csv')

    except Exception:
        return jsonify({'error': 'Не удалось сформировать файл'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000) 
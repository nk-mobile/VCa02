// Форматирование чисел с разделителями тысяч
function formatNumber(num) {
    return new Intl.NumberFormat('ru-RU').format(num);
}

// Форматирование валютных значений
function formatCurrency(amount) {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

// Анимация печати чисел
function animateNumber(element, targetValue, isPercentage = false, isCurrency = false) {
    const startValue = 0;
    const duration = 1000; // 1 секунда
    const startTime = performance.now();
    
    function updateNumber(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing функция для плавной анимации
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const currentValue = startValue + (targetValue - startValue) * easeOutQuart;
        
        if (isCurrency) {
            element.textContent = formatCurrency(currentValue);
        } else if (isPercentage) {
            element.textContent = `${currentValue.toFixed(1)}%`;
        } else {
            element.textContent = formatNumber(Math.round(currentValue));
        }
        
        if (progress < 1) {
            requestAnimationFrame(updateNumber);
        } else {
            if (isCurrency) {
                element.textContent = formatCurrency(targetValue);
            } else if (isPercentage) {
                element.textContent = `${targetValue.toFixed(1)}%`;
            } else {
                element.textContent = formatNumber(targetValue);
            }
        }
    }
    
    requestAnimationFrame(updateNumber);
}

// Обновление прогресс-бара по отношению к телу кредита и переплате
function updateProgressBar(principal, overpayment) {
    const progressFill = document.getElementById('progress-fill');
    const total = principal + overpayment;
    const principalPct = total > 0 ? (principal / total) * 100 : 0;
    
    setTimeout(() => {
        progressFill.style.width = `${principalPct}%`;
    }, 500);
}

// Показ/скрытие элементов с анимацией
function showElement(element) {
    element.classList.remove('hidden');
    setTimeout(() => {
        element.style.opacity = '1';
        element.style.transform = 'translateY(0)';
    }, 10);
}

function hideElement(element) {
    element.style.opacity = '0';
    element.style.transform = 'translateY(20px)';
    setTimeout(() => {
        element.classList.add('hidden');
    }, 300);
}

// Показ ошибки
function showError(message) {
    const errorElement = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    const resultsElement = document.getElementById('results');
    
    hideElement(resultsElement);
    errorMessage.textContent = message;
    showElement(errorElement);
}

// Глобальная ссылка на график
let amortChart = null;

// Построение диаграммы (Stacked Bar: основная часть и проценты)
function renderChart(schedule) {
    const ctx = document.getElementById('amortization-chart');
    if (!ctx) return;

    const principalData = schedule.map(r => r.principal);
    const interestData = schedule.map(r => r.interest);
    const labels = schedule.map((r, idx) => `${r.month}`);

    if (amortChart) {
        amortChart.destroy();
    }

    amortChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Основной долг',
                    data: principalData,
                    backgroundColor: 'rgba(116, 90, 242, 0.6)',
                    borderColor: 'rgba(116, 90, 242, 1)',
                    borderWidth: 1,
                    stack: 'stack1'
                },
                {
                    label: 'Проценты',
                    data: interestData,
                    backgroundColor: 'rgba(255, 206, 86, 0.6)',
                    borderColor: 'rgba(255, 206, 86, 1)',
                    borderWidth: 1,
                    stack: 'stack1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.95)' } },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            return `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`;
                        }
                    }
                }
            },
            scales: {
                x: { stacked: true, ticks: { color: 'rgba(255,255,255,0.85)' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                y: { stacked: true, ticks: { color: 'rgba(255,255,255,0.85)' }, grid: { color: 'rgba(255,255,255,0.1)' } }
            }
        }
    });
}

// Построение таблицы графика
function buildScheduleTable(schedule) {
    const tbody = document.querySelector('#schedule-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const frag = document.createDocumentFragment();
    schedule.forEach(row => {
        const tr = document.createElement('tr');
        const tds = [
            row.month,
            formatCurrency(row.payment),
            formatCurrency(row.interest),
            formatCurrency(row.principal),
            formatCurrency(row.remaining)
        ];
        tds.forEach(text => {
            const td = document.createElement('td');
            td.textContent = text;
            tr.appendChild(td);
        });
        frag.appendChild(tr);
    });
    tbody.appendChild(frag);
}

// Показ результатов
function showResults(data) {
    const resultsElement = document.getElementById('results');
    const errorElement = document.getElementById('error');
    
    hideElement(errorElement);
    
    // Анимация чисел
    setTimeout(() => {
        animateNumber(
            document.getElementById('monthly-payment'), 
            data.monthly_payment, 
            false, 
            true
        );
        
        animateNumber(
            document.getElementById('principal'), 
            data.principal, 
            false, 
            true
        );

        animateNumber(
            document.getElementById('total-amount'), 
            data.total_amount_payments, 
            false, 
            true
        );
        
        animateNumber(
            document.getElementById('overpayment'), 
            data.overpayment, 
            false, 
            true
        );

        animateNumber(
            document.getElementById('cash-total'), 
            data.cash_total, 
            false, 
            true
        );
        
        updateProgressBar(data.principal, data.overpayment);

        // График и таблица
        renderChart(data.schedule || []);
        buildScheduleTable(data.schedule || []);
    }, 200);
    
    showElement(resultsElement);
}

// Валидация формы
function validateForm(formData) {
    const loanAmount = parseFloat(formData.get('loan_amount'));
    const downPayment = parseFloat(formData.get('down_payment')) || 0;
    const years = parseInt(formData.get('years'));
    const interestRate = parseFloat(formData.get('interest_rate'));
    const isInstallment = formData.get('is_installment') === 'true';

    if (!loanAmount || loanAmount <= 0) {
        throw new Error('Введите корректную сумму недвижимости');
    }

    if (downPayment < 0) {
        throw new Error('Первоначальный взнос не может быть отрицательным');
    }

    if (downPayment >= loanAmount) {
        throw new Error('Первоначальный взнос должен быть меньше суммы недвижимости');
    }
    
    if (!years || years <= 0 || years > 50) {
        throw new Error('Срок кредита должен быть от 1 до 50 лет');
    }
    
    if (!isInstallment) {
        if (isNaN(interestRate) || interestRate < 0 || interestRate > 100) {
            throw new Error('Процентная ставка должна быть от 0% до 100%');
        }
    }

    const prepaymentAmount = parseFloat(formData.get('prepayment_amount')) || 0;
    const prepaymentMonthRaw = formData.get('prepayment_month');
    const prepaymentMonth = prepaymentMonthRaw ? parseInt(prepaymentMonthRaw) : null;
    const prepaymentStrategy = formData.get('prepayment_strategy') || 'reduce_term';

    if (prepaymentAmount < 0) {
        throw new Error('Сумма досрочного платежа не может быть отрицательной');
    }

    return {
        loan_amount: loanAmount,
        down_payment: downPayment,
        years: years,
        interest_rate: isInstallment ? 0 : interestRate,
        is_installment: isInstallment,
        prepayment_amount: prepaymentAmount,
        prepayment_month: prepaymentMonth,
        prepayment_strategy: prepaymentStrategy
    };
}

// Обработка отправки формы
async function handleFormSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const submitButton = form.querySelector('.calculate-btn');
    const formData = new FormData(form);

    // Проставляем флаг рассрочки из атрибута кнопки
    const installmentToggle = document.getElementById('installment-toggle');
    formData.set('is_installment', installmentToggle.getAttribute('aria-pressed') === 'true');
    
    try {
        // Валидация на клиенте
        const validatedData = validateForm(formData);
        
        // Показ загрузки
        submitButton.classList.add('loading');
        submitButton.disabled = true;
        
        // Отправка запроса
        const response = await fetch('/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(validatedData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка при расчете');
        }
        
        // Показ результатов
        showResults(data);
        
    } catch (error) {
        console.error('Ошибка:', error);
        showError(error.message);
    } finally {
        // Убираем индикатор загрузки
        submitButton.classList.remove('loading');
        submitButton.disabled = false;
    }
}

// Форматирование ввода в реальном времени
function formatInput(input, type) {
    let value = input.value.replace(/[^\d.,]/g, '');
    
    if (type === 'currency') {
        value = value.replace(/[^\d]/g, '');
        if (value.length > 12) {
            value = value.substring(0, 12);
        }
        input.value = value;
    } else if (type === 'percentage') {
        value = value.replace(',', '.');
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue > 100) {
            input.value = '100';
        } else {
            input.value = value;
        }
    }
}

// Переключение режима «Рассрочка»
function setupInstallmentToggle() {
    const toggle = document.getElementById('installment-toggle');
    const interestGroup = document.getElementById('interest-group');
    toggle.addEventListener('click', () => {
        const pressed = toggle.getAttribute('aria-pressed') === 'true';
        const next = (!pressed).toString();
        toggle.setAttribute('aria-pressed', next);
        toggle.classList.toggle('active', next === 'true');
        // При рассрочке скрываем поле ставки
        if (next === 'true') {
            interestGroup.style.display = 'none';
        } else {
            interestGroup.style.display = '';
        }
    });
}

// Кнопка экспорта CSV (Excel откроет CSV корректно)
function setupExport() {
    const btn = document.getElementById('export-btn');
    const form = document.getElementById('mortgage-form');
    btn.addEventListener('click', async () => {
        const formData = new FormData(form);
        const installmentToggle = document.getElementById('installment-toggle');
        formData.set('is_installment', installmentToggle.getAttribute('aria-pressed') === 'true');
        try {
            const validated = validateForm(formData);
            const resp = await fetch('/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validated)
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.error || 'Ошибка экспорта');
            }
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mortgage_schedule.csv';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            showError(e.message);
        }
    });
}

// Добавление подсказок при фокусе
function addInputHints() {
    const inputs = document.querySelectorAll('input[type="number"]');
    
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            input.style.transform = 'scale(1.02)';
        });
        
        input.addEventListener('blur', () => {
            input.style.transform = 'scale(1)';
        });
        
        // Форматирование при вводе
        input.addEventListener('input', () => {
            if (input.name === 'loan_amount' || input.name === 'down_payment' || input.name === 'prepayment_amount') {
                formatInput(input, 'currency');
            } else if (input.name === 'interest_rate') {
                formatInput(input, 'percentage');
            }
        });
    });
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('mortgage-form');
    
    // Обработчик отправки формы
    form.addEventListener('submit', handleFormSubmit);
    
    // Переключатель рассрочки и экспорт
    setupInstallmentToggle();
    setupExport();

    // Добавление интерактивности к полям ввода
    addInputHints();
    
    // Предзаполнение формы примерными значениями
    document.getElementById('loan-amount').value = '3000000';
    const down = document.getElementById('down-payment');
    if (down) down.value = '600000';
    document.getElementById('years').value = '20';
    document.getElementById('interest-rate').value = '7.5';
    
    // Добавление эффекта параллакса к фигурам
    let mouseX = 0;
    let mouseY = 0;
    
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX / window.innerWidth;
        mouseY = e.clientY / window.innerHeight;
        
        const shapes = document.querySelectorAll('.shape');
        shapes.forEach((shape, index) => {
            const speed = (index + 1) * 0.5;
            const x = (mouseX - 0.5) * speed;
            const y = (mouseY - 0.5) * speed;
            
            shape.style.transform = `translate(${x}px, ${y}px) rotate(${x * 2}deg)`;
        });
    });
    
    console.log('🏠 Ипотечный калькулятор загружен!');
}); 
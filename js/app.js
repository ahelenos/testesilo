"use strict";


/* =========================================================
   CONTROLE DE SILO — V1.4
========================================================= */

const STORAGE_KEY = "controle_silo_v12";

const DEFAULT_DATA = {

    siloName: "Silo 01",

    unit: "kg",

    capacity: 30000,

    minimumStock: 5000,

    stock: 0,

    movements: []

};


let appData =
    loadData();


let currentMovementType =
    null;


let currentSettingsType =
    null;


let editingMovementId =
    null;


let confirmCallback =
    null;


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        setupEvents();

        render();

    }
);


/* =========================================================
   ELEMENTOS
========================================================= */

function getElement(id) {

    return document.getElementById(id);

}


/* =========================================================
   EVENTOS
========================================================= */

function setupEvents() {


    /* Entrada */

    getElement("entryButton")
        .addEventListener(
            "click",
            function () {

                openMovementModal(
                    "entry"
                );

            }
        );


    /* Consumo */

    getElement("consumptionButton")
        .addEventListener(
            "click",
            function () {

                openMovementModal(
                    "consumption"
                );

            }
        );


    /* Modal movimentação */

    getElement("closeMovementModal")
        .addEventListener(
            "click",
            closeMovementModal
        );


    getElement("cancelMovement")
        .addEventListener(
            "click",
            closeMovementModal
        );


    getElement("movementForm")
        .addEventListener(
            "submit",
            handleMovementSubmit
        );


    /* Modal edição */

    getElement("closeEditMovementModal")
        .addEventListener(
            "click",
            closeEditMovementModal
        );


    getElement("cancelEditMovement")
        .addEventListener(
            "click",
            closeEditMovementModal
        );


    getElement("editMovementForm")
        .addEventListener(
            "submit",
            handleEditMovementSubmit
        );


    /* Capacidade */

    getElement("editCapacityButton")
        .addEventListener(
            "click",
            function () {

                openSettingsModal(
                    "capacity"
                );

            }
        );


    /* Estoque mínimo */

    getElement("editMinimumButton")
        .addEventListener(
            "click",
            function () {

                openSettingsModal(
                    "minimum"
                );

            }
        );


    /* Nome do silo */

    getElement("editSiloNameButton")
        .addEventListener(
            "click",
            function () {

                openSettingsModal(
                    "siloName"
                );

            }
        );


    /* Unidade */

    getElement("editUnitButton")
        .addEventListener(
            "click",
            function () {

                openSettingsModal(
                    "unit"
                );

            }
        );


    /* Configurações */

    getElement("closeSettingsModal")
        .addEventListener(
            "click",
            closeSettingsModal
        );


    getElement("cancelSettings")
        .addEventListener(
            "click",
            closeSettingsModal
        );


    getElement("settingsForm")
        .addEventListener(
            "submit",
            handleSettingsSubmit
        );


    /* Histórico */

    getElement("clearHistoryButton")
        .addEventListener(
            "click",
            clearHistory
        );


    /* CSV */

    getElement("exportCsvButton")
        .addEventListener(
            "click",
            exportCSV
        );


    /* Backup */

    getElement("backupButton")
        .addEventListener(
            "click",
            createBackup
        );


    /* Restaurar */

    getElement("restoreButton")
        .addEventListener(
            "click",
            function () {

                getElement(
                    "restoreFile"
                ).click();

            }
        );


    getElement("restoreFile")
        .addEventListener(
            "change",
            handleRestoreFile
        );


    /* Confirmação */

    getElement("confirmCancel")
        .addEventListener(
            "click",
            closeConfirmModal
        );


    getElement("confirmAction")
        .addEventListener(
            "click",
            function () {

                if (
                    typeof confirmCallback ===
                    "function"
                ) {

                    const callback =
                        confirmCallback;

                    closeConfirmModal();

                    callback();

                }

            }
        );


    /* Fechar modal clicando fora */

    document
        .querySelectorAll(
            ".modal-overlay"
        )
        .forEach(
            function (modal) {

                modal.addEventListener(
                    "click",
                    function (event) {

                        if (
                            event.target ===
                            modal
                        ) {

                            modal.classList.remove(
                                "active"
                            );

                        }

                    }
                );

            }
        );


    /* ESC */

    document.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key ===
                "Escape"
            ) {

                closeMovementModal();

                closeEditMovementModal();

                closeSettingsModal();

                closeConfirmModal();

            }

        }
    );

}


/* =========================================================
   CARREGAR DADOS
========================================================= */

function loadData() {

    try {

        let savedData =
            localStorage.getItem(
                STORAGE_KEY
            );


        /*
         * Compatibilidade com V1.
         */

        if (!savedData) {

            savedData =
                localStorage.getItem(
                    "controle_silo_v1"
                );

        }


        /*
         * Sem dados.
         */

        if (!savedData) {

            return createDefaultData();

        }


        const data =
            JSON.parse(
                savedData
            );


        const result = {

            siloName:
                data.siloName ||
                DEFAULT_DATA.siloName,

            unit:
                data.unit === "t"
                    ? "t"
                    : "kg",

            capacity:
                Number(
                    data.capacity
                ) ||
                DEFAULT_DATA.capacity,

            minimumStock:
                Number(
                    data.minimumStock
                ) ||
                DEFAULT_DATA.minimumStock,

            stock:
                Number(
                    data.stock
                ) || 0,

            movements:
                Array.isArray(
                    data.movements
                )
                    ? data.movements
                    : []

        };


        return result;

    } catch (error) {

        console.error(
            "Erro ao carregar dados:",
            error
        );


        return createDefaultData();

    }

}


/* =========================================================
   DADOS PADRÃO
========================================================= */

function createDefaultData() {

    return {

        siloName:
            DEFAULT_DATA.siloName,

        unit:
            DEFAULT_DATA.unit,

        capacity:
            DEFAULT_DATA.capacity,

        minimumStock:
            DEFAULT_DATA.minimumStock,

        stock:
            DEFAULT_DATA.stock,

        movements:
            []

    };

}


/* =========================================================
   SALVAR
========================================================= */

function saveData() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
            appData
        )
    );

}


/* =========================================================
   RENDER PRINCIPAL
========================================================= */

function render() {

    renderHeader();

    renderStock();

    renderMetrics();

    renderLastMovements();

    renderHistory();

    renderSettings();

    renderMonthlySummary();

    renderConsumptionChart();

    renderForecast();

}


/* =========================================================
   CABEÇALHO
========================================================= */

function renderHeader() {

    const name =
        getElement(
            "siloNameDisplay"
        );

    if (name) {

        name.textContent =
            appData.siloName;

    }


    const statusText =
        getElement(
            "statusText"
        );


    if (statusText) {

        const status =
            getStockStatus();

        statusText.textContent =
            status.label;

    }

}


/* =========================================================
   ESTOQUE
========================================================= */

function renderStock() {

    const stock =
        calculateCurrentStock();


    const capacity =
        Number(
            appData.capacity
        );


    const percentage =
        capacity > 0
            ? Math.min(
                100,
                Math.max(
                    0,
                    (
                        stock /
                        capacity
                    ) *
                    100
                )
            )
            : 0;


    setText(
        "currentStock",
        formatNumber(
            convertFromKg(
                stock
            )
        )
    );


    setText(
        "currentStockUnit",
        appData.unit
    );


    setText(
        "stockPercentage",
        formatNumber(
            percentage,
            1
        ) + "%"
    );


    setStyle(
        "progressFill",
        "width",
        percentage + "%"
    );


    const progress =
        getElement(
            "progressFill"
        );


    if (progress) {

        const status =
            getStockStatus();


        progress.style.background =
            status.color;

    }


    setText(
        "maxCapacityLabel",
        "Capacidade: " +
        formatNumber(
            convertFromKg(
                capacity
            )
        ) +
        " " +
        appData.unit
    );


    const alertCard =
        getElement(
            "alertCard"
        );


    const alertTitle =
        getElement(
            "alertTitle"
        );


    const alertMessage =
        getElement(
            "alertMessage"
        );


    const status =
        getStockStatus();


    if (alertCard) {

        alertCard.classList.remove(
            "warning",
            "danger"
        );


        if (
            status.level ===
            "warning"
        ) {

            alertCard.classList.add(
                "warning"
            );

        }


        if (
            status.level ===
            "danger"
        ) {

            alertCard.classList.add(
                "danger"
            );

        }

    }


    if (alertTitle) {

        alertTitle.textContent =
            status.title;

    }


    if (alertMessage) {

        alertMessage.textContent =
            status.message;

    }

}


/* =========================================================
   STATUS DO ESTOQUE
========================================================= */

function getStockStatus() {

    const stock =
        calculateCurrentStock();


    const minimum =
        Number(
            appData.minimumStock
        );


    if (
        stock <= 0
    ) {

        return {

            level: "danger",

            label: "Crítico",

            title: "Silo vazio",

            message:
                "Não há cimento disponível no silo.",

            color:
                "#dc2626"

        };

    }


    if (
        stock <= minimum
    ) {

        return {

            level: "danger",

            label: "Crítico",

            title: "Estoque crítico",

            message:
                "O estoque está abaixo ou no limite mínimo configurado.",

            color:
                "#dc2626"

        };

    }


    if (
        stock <=
        minimum * 1.5
    ) {

        return {

            level: "warning",

            label: "Atenção",

            title: "Estoque baixo",

            message:
                "O estoque está se aproximando do limite mínimo.",

            color:
                "#d97706"

        };

    }


    return {

        level: "normal",

        label: "Normal",

        title: "Estoque normal",

        message:
            "O nível de cimento está dentro do esperado.",

        color:
            "#16a34a"

    };

}


/* =========================================================
   MÉTRICAS
========================================================= */

function renderMetrics() {

    const received =
        calculateTotalReceived();


    const consumed =
        calculateTotalConsumed();


    const average =
        calculateMonthlyAverage();


    const autonomy =
        calculateEstimatedDays();


    setText(
        "totalReceived",
        formatNumber(
            convertFromKg(
                received
            )
        )
    );


    setText(
        "totalReceivedUnit",
        appData.unit
    );


    setText(
        "totalConsumed",
        formatNumber(
            convertFromKg(
                consumed
            )
        )
    );


    setText(
        "totalConsumedUnit",
        appData.unit
    );


    setText(
        "dailyAverage",
        average > 0
            ? formatNumber(
                convertFromKg(
                    average
                )
            )
            : "0"
    );


    setText(
        "dailyAverageUnit",
        appData.unit +
        "/dia"
    );


    setText(
        "estimatedDays",
        autonomy !== null
            ? formatNumber(
                autonomy,
                1
            )
            : "—"
    );

}


/* =========================================================
   TOTAL RECEBIDO
========================================================= */

function calculateTotalReceived() {

    return getAllMovements()
        .reduce(
            function (
                total,
                movement
            ) {

                if (
                    movement.type ===
                    "entry"
                ) {

                    return (
                        total +
                        Number(
                            movement.quantity
                        )
                    );

                }


                return total;

            },
            0
        );

}


/* =========================================================
   TOTAL CONSUMIDO
========================================================= */

function calculateTotalConsumed() {

    return getAllMovements()
        .reduce(
            function (
                total,
                movement
            ) {

                if (
                    movement.type ===
                    "consumption"
                ) {

                    return (
                        total +
                        Number(
                            movement.quantity
                        )
                    );

                }


                return total;

            },
            0
        );

}


/* =========================================================
   ESTOQUE ATUAL
========================================================= */

function calculateCurrentStock() {

    return (
        calculateTotalReceived() -
        calculateTotalConsumed()
    );

}


/* =========================================================
   TODAS AS MOVIMENTAÇÕES
========================================================= */

function getAllMovements() {

    if (
        !Array.isArray(
            appData.movements
        )
    ) {

        return [];

    }


    return appData.movements;

}


/* =========================================================
   ÚLTIMA MOVIMENTAÇÃO
========================================================= */

function getLastMovement(
    type
) {

    const movements =
        getAllMovements()
            .filter(
                function (movement) {

                    return (
                        movement.type ===
                        type
                    );

                }
            );


    if (
        movements.length ===
        0
    ) {

        return null;

    }


    movements.sort(
        function (a, b) {

            const dateA =
                getMovementDate(a);


            const dateB =
                getMovementDate(b);


            if (!dateA) {

                return 1;

            }


            if (!dateB) {

                return -1;

            }


            return dateB - dateA;

        }
    );


    return movements[0];

}


/* =========================================================
   MÉDIA MENSAL
========================================================= */

/*
 * Soma todos os consumos do mês atual.
 *
 * Divide somente pela quantidade
 * de dias diferentes em que houve
 * consumo.
 *
 * Exemplo:
 *
 * Dia 02 = 1.000
 * Dia 02 =   500
 * Dia 10 = 2.000
 * Dia 25 =   500
 *
 * Total = 4.000
 *
 * Dias = 3
 *
 * Média = 1.333,33 kg/dia
 */

function calculateMonthlyAverage() {

    const now =
        new Date();


    const currentYear =
        now.getFullYear();


    const currentMonth =
        now.getMonth();


    const consumptionDays =
        new Set();


    let monthlyConsumption =
        0;


    getAllMovements()
        .forEach(
            function (movement) {

                if (
                    movement.type !==
                    "consumption"
                ) {

                    return;

                }


                const date =
                    getMovementDate(
                        movement
                    );


                if (!date) {

                    return;

                }


                if (
                    date.getFullYear() !==
                    currentYear
                ) {

                    return;

                }


                if (
                    date.getMonth() !==
                    currentMonth
                ) {

                    return;

                }


                monthlyConsumption +=
                    Number(
                        movement.quantity
                    ) || 0;


                const dayKey =
                    date.getFullYear() +
                    "-" +
                    date.getMonth() +
                    "-" +
                    date.getDate();


                consumptionDays.add(
                    dayKey
                );

            }
        );


    if (
        consumptionDays.size ===
        0
    ) {

        return 0;

    }


    return (
        monthlyConsumption /
        consumptionDays.size
    );

}


/* =========================================================
   RESUMO MENSAL
========================================================= */

function getCurrentMonthData() {

    const now =
        new Date();


    const year =
        now.getFullYear();


    const month =
        now.getMonth();


    const days =
        new Set();


    let total =
        0;


    getAllMovements()
        .forEach(
            function (movement) {

                if (
                    movement.type !==
                    "consumption"
                ) {

                    return;

                }


                const date =
                    getMovementDate(
                        movement
                    );


                if (!date) {

                    return;

                }


                if (
                    date.getFullYear() !==
                    year
                ) {

                    return;

                }


                if (
                    date.getMonth() !==
                    month
                ) {

                    return;

                }


                total +=
                    Number(
                        movement.quantity
                    ) || 0;


                days.add(
                    getDateKey(date)
                );

            }
        );


    return {

        year: year,

        month: month,

        total: total,

        days: days,

        daysCount:
            days.size,

        average:
            days.size > 0
                ? total / days.size
                : 0

    };

}


/* =========================================================
   RENDER RESUMO MENSAL
========================================================= */

function renderMonthlySummary() {

    const data =
        getCurrentMonthData();


    const monthName =
        new Intl.DateTimeFormat(
            "pt-BR",
            {
                month: "long",
                year: "numeric"
            }
        )
        .format(
            new Date(
                data.year,
                data.month,
                1
            )
        );


    const period =
        capitalizeFirst(
            monthName
        );


    setText(
        "monthlyPeriod",
        period
    );


    setText(
        "monthlyConsumption",
        formatNumber(
            convertFromKg(
                data.total
            )
        )
    );


    setText(
        "monthlyConsumptionUnit",
        appData.unit
    );


    setText(
        "monthlyConsumptionDays",
        data.daysCount
    );


    setText(
        "monthlyAverage",
        data.average > 0
            ? formatNumber(
                convertFromKg(
                    data.average
                )
            )
            : "0"
    );


    setText(
        "monthlyAverageUnit",
        appData.unit +
        "/dia"
    );


    const forecast =
        calculateDaysUntilMinimum(
            data.average
        );


    setText(
        "monthlyForecast",
        forecast !== null
            ? formatNumber(
                forecast,
                1
            )
            : "—"
    );

}


/* =========================================================
   PREVISÃO ATÉ ESTOQUE MÍNIMO
========================================================= */

function calculateDaysUntilMinimum(
    average
) {

    const currentStock =
        calculateCurrentStock();


    const minimum =
        Number(
            appData.minimumStock
        );


    const dailyAverage =
        Number(
            average
        );


    if (
        dailyAverage <= 0
    ) {

        return null;

    }


    const available =
        currentStock -
        minimum;


    if (
        available <= 0
    ) {

        return 0;

    }


    return (
        available /
        dailyAverage
    );

}


/* =========================================================
   AUTONOMIA ESTIMADA
========================================================= */

function calculateEstimatedDays() {

    const average =
        calculateMonthlyAverage();


    if (
        average <= 0
    ) {

        return null;

    }


    const stock =
        calculateCurrentStock();


    return (
        stock /
        average
    );

}


/* =========================================================
   GRÁFICO DE CONSUMO
========================================================= */

function renderConsumptionChart() {

    const canvas =
        getElement(
            "consumptionChart"
        );


    const emptyState =
        getElement(
            "chartEmptyState"
        );


    if (!canvas) {

        return;

    }


    const data =
        getCurrentMonthData();


    const now =
        new Date();


    const year =
        data.year;


    const month =
        data.month;


    const lastDay =
        new Date(
            year,
            month + 1,
            0
        )
        .getDate();


    const daily =
        [];


    for (
        let day = 1;
        day <= lastDay;
        day++
    ) {

        daily.push({
            day: day,
            value: 0
        });

    }


    getAllMovements()
        .forEach(
            function (movement) {

                if (
                    movement.type !==
                    "consumption"
                ) {

                    return;

                }


                const date =
                    getMovementDate(
                        movement
                    );


                if (!date) {

                    return;

                }


                if (
                    date.getFullYear() !==
                    year ||
                    date.getMonth() !==
                    month
                ) {

                    return;

                }


                const index =
                    date.getDate() - 1;


                if (
                    daily[index]
                ) {

                    daily[index].value +=
                        Number(
                            movement.quantity
                        ) || 0;

                }

            }
        );


    const hasConsumption =
        daily.some(
            function (item) {

                return item.value > 0;

            }
        );


    if (emptyState) {

        emptyState.style.display =
            hasConsumption
                ? "none"
                : "flex";

    }


    drawConsumptionChart(
        canvas,
        daily,
        hasConsumption
    );


    setText(
        "chartPeriod",
        capitalizeFirst(
            new Intl.DateTimeFormat(
                "pt-BR",
                {
                    month: "long",
                    year: "numeric"
                }
            )
            .format(
                new Date(
                    year,
                    month,
                    1
                )
            )
        )
    );

}


/* =========================================================
   DESENHAR GRÁFICO
========================================================= */

function drawConsumptionChart(
    canvas,
    data,
    hasConsumption
) {

    const rect =
        canvas.getBoundingClientRect();


    const width =
        Math.max(
            300,
            rect.width ||
            canvas.parentElement.clientWidth
        );


    const height =
        Math.max(
            200,
            rect.height ||
            canvas.parentElement.clientHeight
        );


    const ratio =
        window.devicePixelRatio ||
        1;


    canvas.width =
        width * ratio;


    canvas.height =
        height * ratio;


    const ctx =
        canvas.getContext(
            "2d"
        );


    ctx.setTransform(
        ratio,
        0,
        0,
        ratio,
        0,
        0
    );


    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    if (
        !hasConsumption
    ) {

        return;

    }


    const padding = {

        top: 25,

        right: 25,

        bottom: 45,

        left: 58

    };


    const chartWidth =
        width -
        padding.left -
        padding.right;


    const chartHeight =
        height -
        padding.top -
        padding.bottom;


    let maxValue =
        Math.max.apply(
            null,
            data.map(
                function (item) {

                    return item.value;

                }
            )
        );


    if (
        maxValue <= 0
    ) {

        return;

    }


    maxValue =
        niceMax(
            maxValue
        );


    /* Grade */

    ctx.strokeStyle =
        "#e5e7eb";

    ctx.lineWidth =
        1;


    const gridLines =
        5;


    for (
        let i = 0;
        i <= gridLines;
        i++
    ) {

        const y =
            padding.top +
            chartHeight -
            (
                chartHeight *
                i /
                gridLines
            );


        ctx.beginPath();

        ctx.moveTo(
            padding.left,
            y
        );

        ctx.lineTo(
            width -
            padding.right,
            y
        );

        ctx.stroke();


        const value =
            maxValue *
            i /
            gridLines;


        ctx.fillStyle =
            "#6b7280";

        ctx.font =
            "11px Arial";

        ctx.textAlign =
            "right";

        ctx.textBaseline =
            "middle";


        ctx.fillText(
            formatCompact(
                convertFromKg(
                    value
                )
            ),
            padding.left - 8,
            y
        );

    }


    /* Linha */

    const step =
        data.length > 1
            ? chartWidth /
              (
                  data.length - 1
              )
            : chartWidth;


    const points =
        data.map(
            function (item, index) {

                const x =
                    padding.left +
                    index *
                    step;


                const y =
                    padding.top +
                    chartHeight -
                    (
                        item.value /
                        maxValue
                    ) *
                    chartHeight;


                return {

                    x: x,

                    y: y,

                    value:
                        item.value,

                    day:
                        item.day

                };

            }
        );


    /* Área */

    ctx.beginPath();


    points.forEach(
        function (point, index) {

            if (
                index === 0
            ) {

                ctx.moveTo(
                    point.x,
                    point.y
                );

            } else {

                ctx.lineTo(
                    point.x,
                    point.y
                );

            }

        }
    );


    ctx.lineTo(
        points[
            points.length - 1
        ].x,
        padding.top +
        chartHeight
    );


    ctx.lineTo(
        points[0].x,
        padding.top +
        chartHeight
    );


    ctx.closePath();


    ctx.fillStyle =
        "rgba(37, 99, 235, 0.10)";

    ctx.fill();


    /* Linha principal */

    ctx.beginPath();


    points.forEach(
        function (point, index) {

            if (
                index === 0
            ) {

                ctx.moveTo(
                    point.x,
                    point.y
                );

            } else {

                ctx.lineTo(
                    point.x,
                    point.y
                );

            }

        }
    );


    ctx.strokeStyle =
        "#2563eb";

    ctx.lineWidth =
        2.5;

    ctx.stroke();


    /* Pontos */

    points.forEach(
        function (point) {

            if (
                point.value <= 0
            ) {

                return;

            }


            ctx.beginPath();

            ctx.arc(
                point.x,
                point.y,
                4,
                0,
                Math.PI * 2
            );


            ctx.fillStyle =
                "#2563eb";

            ctx.fill();


            ctx.strokeStyle =
                "#ffffff";

            ctx.lineWidth =
                2;

            ctx.stroke();

        }
    );


    /* Datas */

    ctx.fillStyle =
        "#6b7280";

    ctx.font =
        "10px Arial";

    ctx.textAlign =
        "center";

    ctx.textBaseline =
        "top";


    const labelStep =
        data.length > 20
            ? Math.ceil(
                data.length / 10
            )
            : 3;


    data.forEach(
        function (item, index) {

            if (
                index %
                labelStep !==
                0
            ) {

                return;

            }


            const x =
                padding.left +
                index *
                step;


            ctx.fillText(
                String(
                    item.day
                ),
                x,
                padding.top +
                chartHeight +
                10
            );

        }
    );

}


/* =========================================================
   REDIMENSIONAMENTO DO GRÁFICO
========================================================= */

window.addEventListener(
    "resize",
    function () {

        renderConsumptionChart();

    }
);


/* =========================================================
   PREVISÃO VISUAL
========================================================= */

function renderForecast() {

    const stock =
        calculateCurrentStock();


    const minimum =
        Number(
            appData.minimumStock
        );


    const average =
        calculateMonthlyAverage();


    const days =
        calculateDaysUntilMinimum(
            average
        );


    setText(
        "forecastCurrentStock",
        formatNumber(
            convertFromKg(
                stock
            )
        )
    );


    setText(
        "forecastCurrentStockUnit",
        appData.unit
    );


    setText(
        "forecastMinimumStock",
        formatNumber(
            convertFromKg(
                minimum
            )
        )
    );


    setText(
        "forecastMinimumStockUnit",
        appData.unit
    );


    if (
        days === null
    ) {

        setText(
            "forecastDays",
            "—"
        );


        setText(
            "forecastMessage",
            "Aguardando consumo no mês"
        );


        return;

    }


    if (
        days <= 0
    ) {

        setText(
            "forecastDays",
            "0 dias"
        );


        setText(
            "forecastMessage",
            "O estoque já atingiu o mínimo."
        );


        return;

    }


    setText(
        "forecastDays",
        formatNumber(
            days,
            1
        ) +
        " dias"
    );


    setText(
        "forecastMessage",
        "Estimativa baseada na média mensal."
    );

}


/* =========================================================
   ÚLTIMAS MOVIMENTAÇÕES
========================================================= */

function renderLastMovements() {

    const lastEntry =
        getLastMovement(
            "entry"
        );


    const lastConsumption =
        getLastMovement(
            "consumption"
        );


    if (lastEntry) {

        setText(
            "lastEntryValue",
            formatNumber(
                convertFromKg(
                    Number(
                        lastEntry.quantity
                    )
                )
            ) +
            " " +
            appData.unit
        );


        setText(
            "lastEntryDate",
            formatMovementDate(
                lastEntry
            )
        );

    } else {

        setText(
            "lastEntryValue",
            "—"
        );


        setText(
            "lastEntryDate",
            "Nenhuma entrada registrada"
        );

    }


    if (lastConsumption) {

        setText(
            "lastConsumptionValue",
            formatNumber(
                convertFromKg(
                    Number(
                        lastConsumption.quantity
                    )
                )
            ) +
            " " +
            appData.unit
        );


        setText(
            "lastConsumptionDate",
            formatMovementDate(
                lastConsumption
            )
        );

    } else {

        setText(
            "lastConsumptionValue",
            "—"
        );


        setText(
            "lastConsumptionDate",
            "Nenhum consumo registrado"
        );

    }

}


/* =========================================================
   HISTÓRICO
========================================================= */

function renderHistory() {

    const tbody =
        getElement(
            "historyTable"
        );


    const emptyState =
        getElement(
            "emptyState"
        );


    if (!tbody) {

        return;

    }


    tbody.innerHTML =
        "";


    const movements =
        getAllMovements()
            .slice()
            .sort(
                function (a, b) {

                    const dateA =
                        getMovementDate(a);


                    const dateB =
                        getMovementDate(b);


                    if (!dateA) {

                        return 1;

                    }


                    if (!dateB) {

                        return -1;

                    }


                    return dateB - dateA;

                }
            );


    if (
        movements.length ===
        0
    ) {

        if (emptyState) {

            emptyState.style.display =
                "flex";

        }


        const wrapper =
            tbody.closest(
                ".table-wrapper"
            );


        if (wrapper) {

            wrapper.style.display =
                "none";

        }


        return;

    }


    if (emptyState) {

        emptyState.style.display =
            "none";

    }


    const tableWrapper =
        tbody.closest(
            ".table-wrapper"
        );


    if (tableWrapper) {

        tableWrapper.style.display =
            "block";

    }


    movements.forEach(
        function (movement) {

            const row =
                document.createElement(
                    "tr"
                );


            const dateCell =
                document.createElement(
                    "td"
                );


            dateCell.textContent =
                formatMovementDate(
                    movement
                );


            const typeCell =
                document.createElement(
                    "td"
                );


            typeCell.textContent =
                movement.type ===
                "entry"
                    ? "Entrada"
                    : "Consumo";


            const quantityCell =
                document.createElement(
                    "td"
                );


            quantityCell.textContent =
                (
                    movement.type ===
                    "entry"
                        ? "+"
                        : "-"
                ) +
                formatNumber(
                    convertFromKg(
                        Number(
                            movement.quantity
                        )
                    )
                ) +
                " " +
                appData.unit;


            const observationCell =
                document.createElement(
                    "td"
                );


            observationCell.textContent =
                movement.observation ||
                "—";


            const balanceCell =
                document.createElement(
                    "td"
                );


            balanceCell.textContent =
                formatNumber(
                    convertFromKg(
                        Number(
                            movement.balance
                        )
                    )
                ) +
                " " +
                appData.unit;


            const actionsCell =
                document.createElement(
                    "td"
                );


            const editButton =
                document.createElement(
                    "button"
                );


            editButton.type =
                "button";


            editButton.className =
                "edit-button";


            editButton.textContent =
                "✎";


            editButton.title =
                "Editar";


            editButton.addEventListener(
                "click",
                function () {

                    openEditMovementModal(
                        movement.id
                    );

                }
            );


            const deleteButton =
                document.createElement(
                    "button"
                );


            deleteButton.type =
                "button";


            deleteButton.className =
                "edit-button";


            deleteButton.textContent =
                "×";


            deleteButton.title =
                "Excluir";


            deleteButton.style.marginLeft =
                "5px";


            deleteButton.addEventListener(
                "click",
                function () {

                    confirmDeleteMovement(
                        movement.id
                    );

                }
            );


            actionsCell.appendChild(
                editButton
            );


            actionsCell.appendChild(
                deleteButton
            );


            row.appendChild(
                dateCell
            );


            row.appendChild(
                typeCell
            );


            row.appendChild(
                quantityCell
            );


            row.appendChild(
                observationCell
            );


            row.appendChild(
                balanceCell
            );


            row.appendChild(
                actionsCell
            );


            tbody.appendChild(
                row
            );

        }
    );

}


/* =========================================================
   CONFIGURAÇÕES
========================================================= */

function renderSettings() {

    setText(
        "settingsSiloName",
        appData.siloName
    );


    setText(
        "capacityValue",
        formatNumber(
            convertFromKg(
                appData.capacity
            )
        )
    );


    setText(
        "capacityUnit",
        appData.unit
    );


    setText(
        "minimumStockValue",
        formatNumber(
            convertFromKg(
                appData.minimumStock
            )
        )
    );


    setText(
        "minimumStockUnit",
        appData.unit
    );


    setText(
        "settingsUnit",
        appData.unit === "kg"
            ? "Quilogramas (kg)"
            : "Toneladas (t)"
    );

}


/* =========================================================
   MODAL DE MOVIMENTAÇÃO
========================================================= */

function openMovementModal(
    type
) {

    currentMovementType =
        type;


    const modal =
        getElement(
            "movementModal"
        );


    const title =
        getElement(
            "movementModalTitle"
        );


    const label =
        getElement(
            "movementModalLabel"
        );


    const icon =
        getElement(
            "movementModalIcon"
        );


    const unit =
        getElement(
            "quantityUnit"
        );


    const form =
        getElement(
            "movementForm"
        );


    form.reset();


    unit.textContent =
        appData.unit;


    if (
        type ===
        "entry"
    ) {

        title.textContent =
            "Registrar entrada";

        label.textContent =
            "ENTRADA";

        icon.textContent =
            "+";

        icon.style.background =
            "#f0fdf4";

        icon.style.color =
            "#16a34a";

    } else {

        title.textContent =
            "Registrar consumo";

        label.textContent =
            "CONSUMO";

        icon.textContent =
            "−";

        icon.style.background =
            "#eff6ff";

        icon.style.color =
            "#2563eb";

    }


    clearError(
        "movementError"
    );


    modal.classList.add(
        "active"
    );


    setTimeout(
        function () {

            getElement(
                "quantity"
            ).focus();

        },
        50
    );

}


/* =========================================================
   FECHAR MODAL MOVIMENTAÇÃO
========================================================= */

function closeMovementModal() {

    const modal =
        getElement(
            "movementModal"
        );


    if (modal) {

        modal.classList.remove(
            "active"
        );

    }


    currentMovementType =
        null;

}


/* =========================================================
   SALVAR MOVIMENTAÇÃO
========================================================= */

function handleMovementSubmit(
    event
) {

    event.preventDefault();


    const quantityInput =
        getElement(
            "quantity"
        );


    const observationInput =
        getElement(
            "observation"
        );


    const quantity =
        Number(
            quantityInput.value
        );


    const observation =
        observationInput.value
            .trim();


    clearError(
        "movementError"
    );


    if (
        !Number.isFinite(
            quantity
        ) ||
        quantity <= 0
    ) {

        showFormError(
            "movementError",
            "Informe uma quantidade válida."
        );


        return;

    }


    const quantityKg =
        convertToKg(
            quantity
        );


    const currentStock =
        calculateCurrentStock();


    if (
        currentMovementType ===
        "consumption"
    ) {

        if (
            quantityKg >
            currentStock
        ) {

            showFormError(
                "movementError",
                "O consumo não pode ser maior que o estoque atual."
            );


            return;

        }

    }


    if (
        currentMovementType ===
        "entry"
    ) {

        if (
            currentStock +
            quantityKg >
            Number(
                appData.capacity
            )
        ) {

            showFormError(
                "movementError",
                "A entrada ultrapassa a capacidade do silo."
            );


            return;

        }

    }


    const movement = {

        id:
            generateId(),

        type:
            currentMovementType,

        quantity:
            quantityKg,

        observation:
            observation,

        date:
            new Date().toISOString(),

        balance:
            0

    };


    appData.movements.push(
        movement
    );


    recalculateBalances();


    saveData();

    render();

    closeMovementModal();


    showToast(
        currentMovementType ===
        "entry"
            ? "Entrada registrada com sucesso."
            : "Consumo registrado com sucesso."
    );

}


/* =========================================================
   RECALCULAR SALDOS
========================================================= */

function recalculateBalances() {

    const movements =
        getAllMovements()
            .slice()
            .sort(
                function (a, b) {

                    const dateA =
                        getMovementDate(a);


                    const dateB =
                        getMovementDate(b);


                    if (!dateA) {

                        return -1;

                    }


                    if (!dateB) {

                        return 1;

                    }


                    return dateA - dateB;

                }
            );


    let balance =
        0;


    movements.forEach(
        function (movement) {

            if (
                movement.type ===
                "entry"
            ) {

                balance +=
                    Number(
                        movement.quantity
                    );

            } else {

                balance -=
                    Number(
                        movement.quantity
                    );

            }


            movement.balance =
                balance;

        }
    );


    appData.stock =
        balance;

}


/* =========================================================
   EDITAR MOVIMENTAÇÃO
   V1.5 — DATA E HORA EDITÁVEIS
========================================================= */

function openEditMovementModal(id) {

    const movement =
        getAllMovements()
            .find(
                function (item) {

                    return (
                        String(item.id) ===
                        String(id)
                    );

                }
            );


    if (!movement) {

        showToast(
            "Movimentação não encontrada.",
            "error"
        );

        return;

    }


    editingMovementId =
        id;


    /*
     * Quantidade
     */

    getElement(
        "editQuantity"
    ).value =
        convertFromKg(
            Number(
                movement.quantity
            )
        );


    /*
     * Unidade
     */

    const unitElement =
        getElement(
            "editMovementUnit"
        );


    if (unitElement) {

        unitElement.textContent =
            appData.unit;

    }


    /*
     * Observação
     */

    getElement(
        "editObservation"
    ).value =
        movement.observation ||
        "";


    /*
     * Data e hora atuais
     */

    const movementDate =
        getMovementDate(
            movement
        );


    if (movementDate) {

        getElement(
            "editDate"
        ).value =
            formatDateForInput(
                movementDate
            );


        getElement(
            "editTime"
        ).value =
            formatTimeForInput(
                movementDate
            );

    } else {

        const now =
            new Date();


        getElement(
            "editDate"
        ).value =
            formatDateForInput(
                now
            );


        getElement(
            "editTime"
        ).value =
            formatTimeForInput(
                now
            );

    }


    clearError(
        "editMovementError"
    );


    getElement(
        "editMovementModal"
    )
    .classList
    .add("active");

}


/* =========================================================
   FORMATAR DATA
========================================================= */

function formatDateForInput(
    date
) {

    if (
        !date ||
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    const year =
        date.getFullYear();


    const month =
        String(
            date.getMonth() + 1
        )
        .padStart(
            2,
            "0"
        );


    const day =
        String(
            date.getDate()
        )
        .padStart(
            2,
            "0"
        );


    return (
        year +
        "-" +
        month +
        "-" +
        day
    );

}


/* =========================================================
   FORMATAR HORA
========================================================= */

function formatTimeForInput(
    date
) {

    if (
        !date ||
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "";

    }


    const hour =
        String(
            date.getHours()
        )
        .padStart(
            2,
            "0"
        );


    const minute =
        String(
            date.getMinutes()
        )
        .padStart(
            2,
            "0"
        );


    return (
        hour +
        ":" +
        minute
    );

}


/* =========================================================
   CRIAR DATA A PARTIR DOS INPUTS
========================================================= */

function createDateFromInputs(
    dateValue,
    timeValue
) {

    if (
        !dateValue ||
        !timeValue
    ) {

        return null;

    }


    const dateParts =
        dateValue.split("-");


    const timeParts =
        timeValue.split(":");


    if (
        dateParts.length !== 3 ||
        timeParts.length < 2
    ) {

        return null;

    }


    const year =
        Number(
            dateParts[0]
        );


    const month =
        Number(
            dateParts[1]
        );


    const day =
        Number(
            dateParts[2]
        );


    const hour =
        Number(
            timeParts[0]
        );


    const minute =
        Number(
            timeParts[1]
        );


    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        !Number.isInteger(hour) ||
        !Number.isInteger(minute)
    ) {

        return null;

    }


    const date =
        new Date(
            year,
            month - 1,
            day,
            hour,
            minute,
            0,
            0
        );


    /*
     * Evita datas inexistentes,
     * como 31/02/2026.
     */

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hour ||
        date.getMinutes() !== minute
    ) {

        return null;

    }


    return date;

}


/* =========================================================
   FECHAR EDIÇÃO
========================================================= */

function closeEditMovementModal() {

    const modal =
        getElement(
            "editMovementModal"
        );


    if (modal) {

        modal.classList.remove(
            "active"
        );

    }


    editingMovementId =
        null;


    clearError(
        "editMovementError"
    );

}


/* =========================================================
   SALVAR EDIÇÃO
========================================================= */

function handleEditMovementSubmit(
    event
) {

    event.preventDefault();


    const movement =
        getAllMovements()
            .find(
                function (item) {

                    return (
                        String(item.id) ===
                        String(
                            editingMovementId
                        )
                    );

                }
            );


    if (!movement) {

        showFormError(
            "editMovementError",
            "Movimentação não encontrada."
        );

        return;

    }


    const quantity =
        Number(
            getElement(
                "editQuantity"
            ).value
        );


    const observation =
        getElement(
            "editObservation"
        )
        .value
        .trim();


    const dateValue =
        getElement(
            "editDate"
        ).value;


    const timeValue =
        getElement(
            "editTime"
        ).value;


    clearError(
        "editMovementError"
    );


    /*
     * Quantidade
     */

    if (
        !Number.isFinite(
            quantity
        ) ||
        quantity <= 0
    ) {

        showFormError(
            "editMovementError",
            "Informe uma quantidade válida."
        );

        return;

    }


    /*
     * Data
     */

    if (!dateValue) {

        showFormError(
            "editMovementError",
            "Informe a data da movimentação."
        );

        return;

    }


    /*
     * Hora
     */

    if (!timeValue) {

        showFormError(
            "editMovementError",
            "Informe a hora da movimentação."
        );

        return;

    }


    /*
     * Converte a nova data.
     */

    const newDate =
        createDateFromInputs(
            dateValue,
            timeValue
        );


    if (!newDate) {

        showFormError(
            "editMovementError",
            "A data ou hora informada é inválida."
        );

        return;

    }


    /*
     * Guarda os valores antigos.
     */

    const oldQuantity =
        movement.quantity;


    const oldObservation =
        movement.observation;


    const oldDate =
        movement.date;


    /*
     * Aplica temporariamente
     * os novos valores.
     */

    movement.quantity =
        convertToKg(
            quantity
        );


    movement.observation =
        observation;


    movement.date =
        newDate.toISOString();


    /*
     * Calcula o novo estoque.
     *
     * IMPORTANTE:
     * esta é a função existente
     * na sua versão atual.
     */

    const testStock =
        calculateCurrentStock();


    /*
     * Verifica estoque negativo.
     */

    if (
        testStock < 0
    ) {

        movement.quantity =
            oldQuantity;


        movement.observation =
            oldObservation;


        movement.date =
            oldDate;


        showFormError(
            "editMovementError",
            "Essa alteração faria o estoque ficar negativo."
        );

        return;

    }


    /*
     * Verifica capacidade do silo.
     */

    if (
        testStock >
        Number(
            appData.capacity
        )
    ) {

        movement.quantity =
            oldQuantity;


        movement.observation =
            oldObservation;


        movement.date =
            oldDate;


        showFormError(
            "editMovementError",
            "Essa alteração ultrapassa a capacidade do silo."
        );

        return;

    }


    /*
     * Agora recalcula TODOS os saldos.
     *
     * Essa função já existe na sua versão
     * atual e ordena pelo campo date.
     */

    recalculateBalances();


    /*
     * Salva.
     */

    saveData();


    /*
     * Atualiza a interface.
     */

    render();


    /*
     * Fecha modal.
     */

    closeEditMovementModal();


    showToast(
        "Movimentação alterada com sucesso."
    );

}
/* =========================================================
   EXCLUIR MOVIMENTAÇÃO
========================================================= */

function confirmDeleteMovement(
    id
) {

    const movement =
        getAllMovements()
            .find(
                function (item) {

                    return (
                        String(
                            item.id
                        ) ===
                        String(id)
                    );

                }
            );


    if (!movement) {

        return;

    }


    openConfirmModal(
        "Excluir movimentação?",
        "Essa movimentação será removida do histórico.",
        function () {

            deleteMovement(
                id
            );

        }
    );

}


/* =========================================================
   EXCLUIR
========================================================= */

function deleteMovement(
    id
) {

    appData.movements =
        getAllMovements()
            .filter(
                function (movement) {

                    return (
                        String(
                            movement.id
                        ) !==
                        String(id)
                    );

                }
            );


    recalculateBalances();


    saveData();

    render();


    showToast(
        "Movimentação excluída."
    );

}


/* =========================================================
   LIMPAR HISTÓRICO
========================================================= */

function clearHistory() {

    if (
        getAllMovements().length ===
        0
    ) {

        showToast(
            "O histórico já está vazio."
        );


        return;

    }


    openConfirmModal(
        "Limpar histórico?",
        "Todas as movimentações serão excluídas. Essa ação não pode ser desfeita.",
        function () {

            appData.movements =
                [];

            appData.stock =
                0;


            saveData();

            render();


            showToast(
                "Histórico limpo."
            );

        }
    );

}


/* =========================================================
   MODAL CONFIGURAÇÕES
========================================================= */

function openSettingsModal(
    type
) {

    currentSettingsType =
        type;


    const valueGroup =
        getElement(
            "settingsValueGroup"
        );


    const nameGroup =
        getElement(
            "siloNameGroup"
        );


    const unitGroup =
        getElement(
            "unitGroup"
        );


    valueGroup.style.display =
        "none";


    nameGroup.style.display =
        "none";


    unitGroup.style.display =
        "none";


    if (
        type ===
        "capacity"
    ) {

        getElement(
            "settingsTitle"
        ).textContent =
            "Alterar capacidade";


        valueGroup.style.display =
            "block";


        getElement(
            "settingsValue"
        ).value =
            convertFromKg(
                appData.capacity
            );


        getElement(
            "settingsValueUnit"
        ).textContent =
            appData.unit;

    }


    if (
        type ===
        "minimum"
    ) {

        getElement(
            "settingsTitle"
        ).textContent =
            "Alterar estoque mínimo";


        valueGroup.style.display =
            "block";


        getElement(
            "settingsValue"
        ).value =
            convertFromKg(
                appData.minimumStock
            );


        getElement(
            "settingsValueUnit"
        ).textContent =
            appData.unit;

    }


    if (
        type ===
        "siloName"
    ) {

        getElement(
            "settingsTitle"
        ).textContent =
            "Alterar nome do silo";


        nameGroup.style.display =
            "block";


        getElement(
            "siloNameInput"
        ).value =
            appData.siloName;

    }


    if (
        type ===
        "unit"
    ) {

        getElement(
            "settingsTitle"
        ).textContent =
            "Alterar unidade";


        unitGroup.style.display =
            "block";


        getElement(
            "settingsUnitSelect"
        ).value =
            appData.unit;

    }


    clearError(
        "settingsError"
    );


    getElement(
        "settingsModal"
    ).classList.add(
        "active"
    );

}


/* =========================================================
   SALVAR CONFIGURAÇÕES
========================================================= */

function handleSettingsSubmit(
    event
) {

    event.preventDefault();


    clearError(
        "settingsError"
    );


    if (
        currentSettingsType ===
        "siloName"
    ) {

        const name =
            getElement(
                "siloNameInput"
            ).value.trim();


        if (!name) {

            showFormError(
                "settingsError",
                "Informe um nome para o silo."
            );


            return;

        }


        appData.siloName =
            name;

    }


    if (
        currentSettingsType ===
        "capacity"
    ) {

        const value =
            Number(
                getElement(
                    "settingsValue"
                ).value
            );


        if (
            !Number.isFinite(
                value
            ) ||
            value <= 0
        ) {

            showFormError(
                "settingsError",
                "Informe uma capacidade válida."
            );


            return;

        }


        const capacityKg =
            convertToKg(
                value
            );


        if (
            capacityKg <
            calculateCurrentStock()
        ) {

            showFormError(
                "settingsError",
                "A capacidade não pode ser menor que o estoque atual."
            );


            return;

        }


        appData.capacity =
            capacityKg;

    }


    if (
        currentSettingsType ===
        "minimum"
    ) {

        const value =
            Number(
                getElement(
                    "settingsValue"
                ).value
            );


        if (
            !Number.isFinite(
                value
            ) ||
            value < 0
        ) {

            showFormError(
                "settingsError",
                "Informe um estoque mínimo válido."
            );


            return;

        }


        appData.minimumStock =
            convertToKg(
                value
            );

    }


    if (
        currentSettingsType ===
        "unit"
    ) {

        const newUnit =
            getElement(
                "settingsUnitSelect"
            ).value;


        if (
            newUnit !== "kg" &&
            newUnit !== "t"
        ) {

            return;

        }


        appData.unit =
            newUnit;

    }


    saveData();

    render();

    closeSettingsModal();


    showToast(
        "Configuração alterada com sucesso."
    );

}


/* =========================================================
   FECHAR CONFIGURAÇÕES
========================================================= */

function closeSettingsModal() {

    const modal =
        getElement(
            "settingsModal"
        );


    if (modal) {

        modal.classList.remove(
            "active"
        );

    }


    currentSettingsType =
        null;

}


/* =========================================================
   MODAL DE CONFIRMAÇÃO
========================================================= */

function openConfirmModal(
    title,
    message,
    callback
) {

    setText(
        "confirmTitle",
        title
    );


    setText(
        "confirmMessage",
        message
    );


    confirmCallback =
        callback;


    getElement(
        "confirmModal"
    ).classList.add(
        "active"
    );

}


/* =========================================================
   FECHAR CONFIRMAÇÃO
========================================================= */

function closeConfirmModal() {

    const modal =
        getElement(
            "confirmModal"
        );


    if (modal) {

        modal.classList.remove(
            "active"
        );

    }


    confirmCallback =
        null;

}


/* =========================================================
   CSV
========================================================= */

function exportCSV() {

    const movements =
        getAllMovements()
            .slice()
            .sort(
                function (a, b) {

                    return (
                        getMovementDate(a) -
                        getMovementDate(b)
                    );

                }
            );


    const rows = [

        [
            "Data",
            "Tipo",
            "Quantidade",
            "Unidade",
            "Observação",
            "Saldo"
        ]

    ];


    movements.forEach(
        function (movement) {

            rows.push(
                [

                    formatMovementDate(
                        movement
                    ),

                    movement.type ===
                    "entry"
                        ? "Entrada"
                        : "Consumo",

                    formatNumber(
                        convertFromKg(
                            Number(
                                movement.quantity
                            )
                        )
                    ),

                    appData.unit,

                    movement.observation ||
                    "",

                    formatNumber(
                        convertFromKg(
                            Number(
                                movement.balance
                            )
                        )
                    )

                ]
            );

        }
    );


    const csv =
        rows
            .map(
                function (row) {

                    return row
                        .map(
                            function (value) {

                                return csvEscape(
                                    value
                                );

                            }
                        )
                        .join(";");

                }
            )
            .join("\n");


    const blob =
        new Blob(
            [
                "\uFEFF" +
                csv
            ],
            {
                type:
                    "text/csv;charset=utf-8;"
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const link =
        document.createElement(
            "a"
        );


    const date =
        new Date()
            .toISOString()
            .slice(
                0,
                10
            );


    link.href =
        url;


    link.download =
        "historico-silo-" +
        date +
        ".csv";


    document.body.appendChild(
        link
    );


    link.click();


    link.remove();


    URL.revokeObjectURL(
        url
    );


    showToast(
        "CSV exportado com sucesso."
    );

}


/* =========================================================
   CSV ESCAPE
========================================================= */

function csvEscape(
    value
) {

    const text =
        String(
            value ?? ""
        );


    if (
        text.includes(";") ||
        text.includes('"') ||
        text.includes("\n")
    ) {

        return (
            '"' +
            text.replace(
                /"/g,
                '""'
            ) +
            '"'
        );

    }


    return text;

}


/* =========================================================
   BACKUP
========================================================= */

function createBackup() {

    const backup = {

        application:
            "Controle de Silo",

        version:
            "1.4",

        createdAt:
            new Date().toISOString(),

        data:
            appData

    };


    const json =
        JSON.stringify(
            backup,
            null,
            4
        );


    const blob =
        new Blob(
            [
                json
            ],
            {
                type:
                    "application/json"
            }
        );


    const url =
        URL.createObjectURL(
            blob
        );


    const link =
        document.createElement(
            "a"
        );


    const date =
        new Date()
            .toISOString()
            .slice(
                0,
                10
            );


    link.href =
        url;


    link.download =
        "backup-silo-" +
        date +
        ".json";


    document.body.appendChild(
        link
    );


    link.click();


    link.remove();


    URL.revokeObjectURL(
        url
    );


    showToast(
        "Backup criado com sucesso."
    );

}


/* =========================================================
   RESTAURAR BACKUP
========================================================= */

function handleRestoreFile(
    event
) {

    const file =
        event.target.files[0];


    if (!file) {

        return;

    }


    const reader =
        new FileReader();


    reader.onload =
        function () {

            try {

                const backup =
                    JSON.parse(
                        reader.result
                    );


                const data =
                    backup.data ||
                    backup;


                const restored =
                    validateBackupData(
                        data
                    );


                if (!restored) {

                    showToast(
                        "O arquivo de backup é inválido.",
                        "error"
                    );


                    return;

                }


                openConfirmModal(
                    "Restaurar backup?",
                    "Os dados atuais serão substituídos pelos dados do backup.",
                    function () {

                        appData =
                            normalizeBackupData(
                                data
                            );


                        saveData();

                        render();


                        showToast(
                            "Backup restaurado com sucesso."
                        );

                    }
                );


            } catch (error) {

                console.error(
                    error
                );


                showToast(
                    "Não foi possível ler o backup.",
                    "error"
                );

            }


            event.target.value =
                "";

        };


    reader.readAsText(
        file
    );

}


/* =========================================================
   VALIDAR BACKUP
========================================================= */

function validateBackupData(
    data
) {

    if (
        !data ||
        typeof data !==
        "object"
    ) {

        return false;

    }


    if (
        !Array.isArray(
            data.movements
        )
    ) {

        return false;

    }


    return true;

}


/* =========================================================
   NORMALIZAR BACKUP
========================================================= */

function normalizeBackupData(
    data
) {

    return {

        siloName:
            data.siloName ||
            DEFAULT_DATA.siloName,

        unit:
            data.unit === "t"
                ? "t"
                : "kg",

        capacity:
            Number(
                data.capacity
            ) ||
            DEFAULT_DATA.capacity,

        minimumStock:
            Number(
                data.minimumStock
            ) || 0,

        stock:
            Number(
                data.stock
            ) || 0,

        movements:
            Array.isArray(
                data.movements
            )
                ? data.movements
                : []

    };

}


/* =========================================================
   DATA DA MOVIMENTAÇÃO
========================================================= */

function getMovementDate(
    movement
) {

    if (!movement) {

        return null;

    }


    const raw =
        movement.date ||
        movement.createdAt ||
        movement.timestamp;


    if (!raw) {

        return null;

    }


    const date =
        new Date(
            raw
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return null;

    }


    return date;

}


/* =========================================================
   CHAVE DA DATA
========================================================= */

function getDateKey(
    date
) {

    return (
        date.getFullYear() +
        "-" +
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        ) +
        "-" +
        String(
            date.getDate()
        ).padStart(
            2,
            "0"
        )
    );

}


/* =========================================================
   FORMATAR DATA
========================================================= */

function formatMovementDate(
    movement
) {

    const date =
        getMovementDate(
            movement
        );


    if (!date) {

        return "—";

    }


    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            dateStyle: "short",
            timeStyle: "short"
        }
    ).format(
        date
    );

}


/* =========================================================
   CONVERSÃO PARA KG
========================================================= */

function convertToKg(
    value
) {

    const number =
        Number(
            value
        );


    if (
        appData.unit ===
        "t"
    ) {

        return (
            number *
            1000
        );

    }


    return number;

}


/* =========================================================
   CONVERSÃO A PARTIR DE KG
========================================================= */

function convertFromKg(
    value
) {

    const number =
        Number(
            value
        ) || 0;


    if (
        appData.unit ===
        "t"
    ) {

        return (
            number /
            1000
        );

    }


    return number;

}


/* =========================================================
   FORMATAÇÃO NUMÉRICA
========================================================= */

function formatNumber(
    value,
    decimals
) {

    const number =
        Number(
            value
        ) || 0;


    if (
        decimals ===
        undefined
    ) {

        decimals =
            Number.isInteger(
                number
            )
                ? 0
                : 2;

    }


    return new Intl.NumberFormat(
        "pt-BR",
        {
            minimumFractionDigits:
                decimals,

            maximumFractionDigits:
                decimals
        }
    ).format(
        number
    );

}


/* =========================================================
   FORMATAÇÃO COMPACTA
========================================================= */

function formatCompact(
    value
) {

    const number =
        Number(
            value
        ) || 0;


    if (
        Math.abs(
            number
        ) >= 1000
    ) {

        return (
            formatNumber(
                number / 1000,
                1
            ) +
            "k"
        );

    }


    return formatNumber(
        number,
        0
    );

}


/* =========================================================
   MAX DO GRÁFICO
========================================================= */

function niceMax(
    value
) {

    if (
        value <= 0
    ) {

        return 1;

    }


    const magnitude =
        Math.pow(
            10,
            Math.floor(
                Math.log10(
                    value
                )
            )
        );


    const normalized =
        value /
        magnitude;


    let nice;


    if (
        normalized <= 1
    ) {

        nice = 1;

    } else if (
        normalized <= 2
    ) {

        nice = 2;

    } else if (
        normalized <= 5
    ) {

        nice = 5;

    } else {

        nice = 10;

    }


    return (
        nice *
        magnitude
    );

}


/* =========================================================
   CAPITALIZAR
========================================================= */

function capitalizeFirst(
    text
) {

    if (!text) {

        return "";

    }


    return (
        text.charAt(0).toUpperCase() +
        text.slice(1)
    );

}


/* =========================================================
   ID
========================================================= */

function generateId() {

    return (
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .slice(2, 10)
    );

}


/* =========================================================
   SET TEXT
========================================================= */

function setText(
    id,
    value
) {

    const element =
        getElement(
            id
        );


    if (element) {

        element.textContent =
            value;

    }

}


/* =========================================================
   SET STYLE
========================================================= */

function setStyle(
    id,
    property,
    value
) {

    const element =
        getElement(
            id
        );


    if (element) {

        element.style[property] =
            value;

    }

}


/* =========================================================
   ERRO FORMULÁRIO
========================================================= */

function showFormError(
    id,
    message
) {

    const element =
        getElement(
            id
        );


    if (element) {

        element.textContent =
            message;

    }

}


/* =========================================================
   LIMPAR ERRO
========================================================= */

function clearError(
    id
) {

    const element =
        getElement(
            id
        );


    if (element) {

        element.textContent =
            "";

    }

}


/* =========================================================
   TOAST
========================================================= */

function showToast(
    message,
    type
) {

    const toast =
        getElement(
            "toast"
        );


    const toastMessage =
        getElement(
            "toastMessage"
        );


    const toastIcon =
        getElement(
            "toastIcon"
        );


    if (!toast) {

        return;

    }


    toast.classList.remove(
        "show"
    );


    if (toastMessage) {

        toastMessage.textContent =
            message;

    }


    if (toastIcon) {

        if (
            type ===
            "error"
        ) {

            toastIcon.textContent =
                "!";

            toastIcon.style.background =
                "#fef2f2";

            toastIcon.style.color =
                "#dc2626";

        } else {

            toastIcon.textContent =
                "✓";

            toastIcon.style.background =
                "#f0fdf4";

            toastIcon.style.color =
                "#16a34a";

        }

    }


    requestAnimationFrame(
        function () {

            toast.classList.add(
                "show"
            );

        }
    );


    clearTimeout(
        toast._timer
    );


    toast._timer =
        setTimeout(
            function () {

                toast.classList.remove(
                    "show"
                );

            },
            3000
        );

}
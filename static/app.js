const form = document.getElementById("analysisForm");
const analyzeButton = document.getElementById("analyzeButton");
const toast = document.getElementById("toast");

let currentAdvice = [];
let currentLanguage = "english";
let toastTimeout;

const tamilAdvice = [
    {
        test: message => message.includes("Soil moisture is low"),
        text: "மண்ணின் ஈரப்பதம் குறைவாக உள்ளது. பயிரின் நீர் தேவையையும் வயல் நிலையும் சரிபார்க்கவும்."
    },
    {
        test: message => message.includes("Soil moisture is high"),
        text: "மண்ணின் ஈரப்பதம் அதிகமாக உள்ளது. வயலில் நீர் தேங்குகிறதா என்பதைக் கண்காணிக்கவும்."
    },
    {
        test: message => message.includes("High temperature"),
        text: "வெப்பநிலை அதிகமாக உள்ளது. வெப்பமான நேரங்களில் பயிரைக் கண்காணிக்கவும்."
    },
    {
        test: message => message.includes("soil test before making pH"),
        text: "மண்ணின் pH-ஐ மாற்றுவதற்கு முன் மண் பரிசோதனை செய்யவும்."
    },
    {
        test: message => message.includes("may be low"),
        text: "ஒரு ஊட்டச்சத்து அளவு குறைவாக இருக்கலாம். உரத்தை மாற்றுவதற்கு முன் மண் பரிசோதனை முடிவை உறுதிப்படுத்தவும்."
    },
    {
        test: message => message.includes("Continue monitoring"),
        text: "மண்ணின் நிலையைத் தொடர்ந்து கண்காணிக்கவும்."
    }
];

form.addEventListener("submit", async event => {
    event.preventDefault();
    analyzeButton.disabled = true;
    analyzeButton.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Analyzing readings…';

    const values = {};
    new FormData(form).forEach((value, key) => {
        values[key] = Number(value);
    });

    try {
        const response = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values)
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Analysis failed. Please try again.");
        }

        showResults(result);
        await loadHistory();
        showToast("Your soil analysis is ready.");
    } catch (error) {
        showToast(error.message || "Could not complete the analysis.", true);
    } finally {
        analyzeButton.disabled = false;
        analyzeButton.innerHTML = "<span aria-hidden=\"true\">✧</span> Analyze my farm";
    }
});

function showResults(result) {
    const soil = result.soil;
    document.getElementById("cropResult").textContent = result.crop.crop;
    document.getElementById("cropMessage").textContent = result.crop.message;
    document.getElementById("snapshotMoisture").innerHTML = `${formatNumber(soil.moisture)}<small>%</small>`;
    document.getElementById("snapshotPh").textContent = formatNumber(soil.ph);
    document.getElementById("snapshotNitrogen").innerHTML = `${formatNumber(soil.N)}<small> kg/ha</small>`;
    document.getElementById("snapshotTemperature").innerHTML = `${formatNumber(soil.temperature)}<small>°C</small>`;
    document.getElementById("moistureMeter").style.width = `${Math.max(0, Math.min(100, soil.moisture))}%`;
    document.getElementById("moistureState").textContent = soil.moisture < 25 ? "LOW" : soil.moisture > 80 ? "HIGH" : "IN RANGE";
    document.getElementById("phState").textContent = soil.ph < 5.5 ? "ACIDIC" : soil.ph > 7.5 ? "ALKALINE" : "IN RANGE";
    document.getElementById("snapshotStatus").textContent = "Updated just now";
    document.getElementById("phState").classList.toggle("attention", soil.ph < 5.5 || soil.ph > 7.5);
    document.getElementById("moistureState").classList.toggle("attention", soil.moisture < 25 || soil.moisture > 80);

    showSoilFindings(soil);
    currentAdvice = result.advice || [];
    showAdvice();
    showAgentSteps(result.steps || []);
    if (result.telemetry) showTelemetry(result.telemetry);
}

function showSoilFindings(soil) {
    const section = document.getElementById("soilFindings");
    const warnings = document.getElementById("soilWarnings");
    const summary = document.getElementById("nutrientSummary");
    warnings.replaceChildren();
    summary.replaceChildren();

    const items = soil.warnings || [];
    document.getElementById("findingCount").textContent =
        items.length === 1 && items[0].startsWith("No major") ? "LOOKS STEADY" : `${items.length} ${items.length === 1 ? "NOTE" : "NOTES"}`;

    items.forEach(message => {
        const item = document.createElement("div");
        item.className = `warning-item${message.startsWith("No major") ? " positive" : ""}`;
        item.textContent = message;
        warnings.appendChild(item);
    });

    [["Phosphorus", soil.P], ["Potassium", soil.K], ["Humidity", `${formatNumber(soil.humidity)}%`]]
        .forEach(([label, value]) => {
            const item = document.createElement("div");
            item.className = "nutrient-item";
            const name = document.createElement("span");
            name.textContent = label;
            const reading = document.createElement("strong");
            reading.textContent = typeof value === "number" ? formatNumber(value) : value;
            item.append(name, reading);
            summary.appendChild(item);
        });
    section.hidden = false;
}

function showAgentSteps(steps) {
    const container = document.getElementById("agentSteps");
    container.replaceChildren();
    steps.forEach((step, index) => {
        const item = document.createElement("div");
        item.className = "agent-step";
        const number = document.createElement("span");
        number.className = "step-number";
        number.textContent = String(index + 1).padStart(2, "0");
        const copy = document.createElement("div");
        copy.className = "step-copy";
        const title = document.createElement("strong");
        title.textContent = step.tool;
        const detail = document.createElement("span");
        detail.textContent = step.result;
        const status = document.createElement("span");
        status.className = `step-status status-${step.status}`;
        status.textContent = step.status.replaceAll("_", " ");
        copy.append(title, detail);
        item.append(number, copy, status);
        container.appendChild(item);
    });
}

function showAdvice() {
    const list = document.getElementById("adviceList");
    list.replaceChildren();
    currentAdvice.forEach(advice => {
        const item = document.createElement("li");
        const translated = currentLanguage === "tamil"
            ? tamilAdvice.find(entry => entry.test(advice))?.text || "மண்ணின் நிலையைத் தொடர்ந்து கண்காணிக்கவும்."
            : advice;
        item.textContent = translated;
        list.appendChild(item);
    });
}

function setLanguage(language) {
    currentLanguage = language;
    document.getElementById("englishButton").classList.toggle("active", language === "english");
    document.getElementById("tamilButton").classList.toggle("active", language === "tamil");
    document.getElementById("englishButton").setAttribute("aria-pressed", String(language === "english"));
    document.getElementById("tamilButton").setAttribute("aria-pressed", String(language === "tamil"));
    showAdvice();
}

document.getElementById("englishButton").addEventListener("click", () => setLanguage("english"));
document.getElementById("tamilButton").addEventListener("click", () => setLanguage("tamil"));

async function loadTelemetry() {
    const container = document.getElementById("telemetryContent");
    try {
        const response = await fetch("/api/telemetry");
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Telemetry unavailable.");
        showTelemetry(result);
    } catch (error) {
        container.textContent = error.message || "Telemetry could not be loaded.";
        document.getElementById("telemetryTrend").textContent = "Unavailable";
    }
}

function showTelemetry(data) {
    const container = document.getElementById("telemetryContent");
    container.replaceChildren();
    document.getElementById("telemetryTrend").textContent = `${data.trend} trend`;
    document.getElementById("telemetryTrend").className = `trend-pill trend-${data.trend.toLowerCase()}`;

    const chart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chart.setAttribute("viewBox", "0 0 720 230");
    chart.setAttribute("class", "moisture-chart");
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", `Soil moisture ${data.trend.toLowerCase()}, from ${formatNumber(data.first_moisture)} to ${formatNumber(data.latest_moisture)} percent over ${data.records} readings.`);

    const left = 42;
    const right = 700;
    const top = 18;
    const bottom = 178;
    [0, 25, 50, 75, 100].forEach(value => {
        const y = bottom - (value / 100) * (bottom - top);
        const line = svgElement("line", { x1: left, y1: y, x2: right, y2: y, class: "chart-gridline" });
        const label = svgElement("text", { x: 0, y: y + 4, class: "chart-axis-label" });
        label.textContent = String(value);
        chart.append(line, label);
    });

    const points = data.moisture_values.map((value, index, values) => {
        const x = values.length === 1 ? (left + right) / 2 : left + index * (right - left) / (values.length - 1);
        const y = bottom - (Math.max(0, Math.min(100, value)) / 100) * (bottom - top);
        return { x, y, value, date: data.dates[index] };
    });
    if (points.length > 1) {
        const area = svgElement("polygon", {
            points: `${points[0].x},${bottom} ${points.map(point => `${point.x},${point.y}`).join(" ")} ${points[points.length - 1].x},${bottom}`,
            class: "chart-area"
        });
        chart.appendChild(area);
        const line = svgElement("polyline", {
            points: points.map(point => `${point.x},${point.y}`).join(" "),
            class: "chart-line"
        });
        chart.appendChild(line);
    }
    points.forEach(point => {
        const dot = svgElement("circle", { cx: point.x, cy: point.y, r: 4, class: "chart-point" });
        const date = svgElement("text", { x: point.x, y: 205, class: "chart-date", "text-anchor": "middle" });
        date.textContent = point.date.slice(5);
        chart.append(dot, date);
    });
    container.appendChild(chart);

    const stats = document.createElement("div");
    stats.className = "telemetry-summary";
    [
        ["Latest reading", `${formatNumber(data.latest_moisture)}%`],
        ["7-day change", `${data.change > 0 ? "+" : ""}${formatNumber(data.change)}%`],
        ["Readings", String(data.records)]
    ].forEach(([label, value]) => {
        const item = document.createElement("div");
        item.className = "telemetry-stat";
        const name = document.createElement("span");
        name.textContent = label;
        const number = document.createElement("strong");
        number.textContent = value;
        item.append(name, number);
        stats.appendChild(item);
    });
    container.appendChild(stats);
}

function svgElement(tag, attributes) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
    return element;
}

async function loadHistory() {
    const container = document.getElementById("historyContent");
    try {
        const response = await fetch("/api/history");
        const rows = await response.json();
        if (!response.ok) throw new Error("Saved analysis history could not be loaded.");
        document.getElementById("historyCount").textContent = `${rows.length} ${rows.length === 1 ? "record" : "records"}`;
        if (rows.length === 0) {
            container.textContent = "Your completed analyses will be saved here.";
            return;
        }

        const wrapper = document.createElement("div");
        wrapper.className = "table-scroll";
        const table = document.createElement("table");
        table.className = "history-table";
        const header = document.createElement("thead");
        const headingRow = document.createElement("tr");
        ["Date & time", "Crop suggestion", "Moisture", "Temperature", "pH"].forEach(label => {
            const cell = document.createElement("th");
            cell.scope = "col";
            cell.textContent = label;
            headingRow.appendChild(cell);
        });
        header.appendChild(headingRow);
        const body = document.createElement("tbody");
        rows.forEach(row => {
            const tr = document.createElement("tr");
            [
                formatDate(row.created_at),
                row.crop,
                `${formatNumber(row.moisture)}%`,
                `${formatNumber(row.temperature)} °C`,
                formatNumber(row.ph)
            ].forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value;
                tr.appendChild(cell);
            });
            body.appendChild(tr);
        });
        table.append(header, body);
        wrapper.appendChild(table);
        container.replaceChildren(wrapper);
    } catch (error) {
        container.textContent = error.message || "History unavailable.";
    }
}

function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "—";
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
}

function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle("toast-error", isError);
    toast.classList.add("visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 3800);
}

const sections = document.querySelectorAll("main section[id], main[id]");
const navLinks = document.querySelectorAll(".nav-item");
if ("IntersectionObserver" in window) {
    const sectionObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            navLinks.forEach(link => link.classList.toggle("active", link.hash === `#${entry.target.id}`));
        });
    }, { rootMargin: "-25% 0px -65% 0px" });
    sections.forEach(section => sectionObserver.observe(section));
}

loadTelemetry();
loadHistory();

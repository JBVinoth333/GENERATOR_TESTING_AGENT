#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
    const args = {
        input: "TestingAPI/*.json",
        timeout: 90,
        previewChars: 1200,
    };

    const positional = [];
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--timeout") {
            const value = argv[index + 1];
            index += 1;
            args.timeout = Number(value);
            continue;
        }

        if (token === "--preview-chars") {
            const value = argv[index + 1];
            index += 1;
            args.previewChars = Number(value);
            continue;
        }

        positional.push(token);
    }

    if (positional.length > 0) {
        args.input = positional[0];
    }

    if (!Number.isFinite(args.timeout) || args.timeout <= 0) {
        throw new Error("--timeout must be a positive number");
    }

    if (!Number.isFinite(args.previewChars) || args.previewChars <= 0) {
        throw new Error("--preview-chars must be a positive number");
    }

    return args;
}

function resolveFiles(input) {
    if (fs.existsSync(input) && fs.statSync(input).isFile()) {
        return [input];
    }

    if (fs.existsSync(input) && fs.statSync(input).isDirectory()) {
        return fs
            .readdirSync(input)
            .filter((name) => name.toLowerCase().endsWith(".json"))
            .sort()
            .map((name) => path.join(input, name));
    }

    if (input.endsWith("*.json")) {
        const dir = input.slice(0, -"*.json".length) || ".";
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            return fs
                .readdirSync(dir)
                .filter((name) => name.toLowerCase().endsWith(".json"))
                .sort()
                .map((name) => path.join(dir, name));
        }
    }

    return [];
}

function responsePreview(text, limit) {
    if (text.length <= limit) {
        return text;
    }
    return `${text.slice(0, limit)}\n...[truncated]...`;
}

function safeJsonParse(value) {
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function getGeneratorTemplates(caseData) {
    const templates = caseData?.payload?.data_generation_templates;
    return Array.isArray(templates) ? templates : [];
}

function findLogsArray(payload) {
    if (!payload || typeof payload !== "object") {
        return null;
    }

    if (Array.isArray(payload.logs)) {
        return payload.logs;
    }

    for (const value of Object.values(payload)) {
        if (value && typeof value === "object") {
            const found = findLogsArray(value);
            if (Array.isArray(found)) {
                return found;
            }
        }
    }

    return null;
}

function collectStringValues(input, bucket = []) {
    if (typeof input === "string") {
        bucket.push(input);
        return bucket;
    }

    if (Array.isArray(input)) {
        for (const item of input) {
            collectStringValues(item, bucket);
        }
        return bucket;
    }

    if (input && typeof input === "object") {
        for (const value of Object.values(input)) {
            collectStringValues(value, bucket);
        }
    }

    return bucket;
}

function findErrorPlaces(caseData, responseBody) {
    const templates = getGeneratorTemplates(caseData);
    const totalGenerators = templates.length;

    if (totalGenerators === 0) {
        return ["No generator templates found in payload"];
    }

    const parsedBody = safeJsonParse(responseBody);
    const searchableText = parsedBody
        ? collectStringValues(parsedBody).join(" | ").toLowerCase()
        : String(responseBody || "").toLowerCase();

    const matchedPlaces = [];

    templates.forEach((template, index) => {
        const name = String(template?.name || "").trim();
        const operation = String(template?.generatorOperationId || "").trim();
        const method = String(template?.generatorMethod || "").trim();

        const keysToCheck = [name, operation, method].filter(Boolean);
        const matched = keysToCheck.some((key) => searchableText.includes(key.toLowerCase()));

        if (matched) {
            matchedPlaces.push(
                `Generator #${index + 1}${name ? ` (${name})` : ""}${operation ? ` [${operation}]` : ""}${method ? ` [${method}]` : ""}`,
            );
        }
    });

    if (matchedPlaces.length > 0) {
        return matchedPlaces;
    }

    return ["API request level (generator-specific error not provided in response)"];
}

function getGeneratorStats(caseData, resultStatus, responseBody) {
    const totalFromTemplates = getGeneratorTemplates(caseData).length;
    const parsedBody = safeJsonParse(responseBody);
    const logs = parsedBody ? findLogsArray(parsedBody) : null;

    if (!Array.isArray(logs) || logs.length === 0) {
        const isRequestSuccess = /^\d+$/.test(resultStatus) && Number(resultStatus) >= 200 && Number(resultStatus) < 300;
        return {
            totalGenerators: totalFromTemplates,
            generatorSuccess: isRequestSuccess ? totalFromTemplates : 0,
            generatorFailed: isRequestSuccess ? 0 : totalFromTemplates,
            errorPlaces: isRequestSuccess ? ["None"] : findErrorPlaces(caseData, responseBody),
        };
    }

    let generatorSuccess = 0;
    let generatorFailed = 0;
    const errorPlaces = [];

    logs.forEach((logItem, index) => {
        const statusText = String(logItem?.status || "").toUpperCase();
        const operationId = String(logItem?.generationOperationId || logItem?.generatorOperationId || "").trim();
        const message = String(logItem?.message || "").trim();

        if (statusText === "SUCCESS") {
            generatorSuccess += 1;
            return;
        }

        generatorFailed += 1;
        const location = operationId || `Log #${index + 1}`;
        const reason = message || "No error message from API";
        errorPlaces.push(`${location} -> ${reason}`);
    });

    return {
        totalGenerators: logs.length,
        generatorSuccess,
        generatorFailed,
        errorPlaces: errorPlaces.length > 0 ? errorPlaces : ["None"],
    };
}

function buildRequestFromCase(caseData) {
    const url = caseData.API;
    if (!url) {
        throw new Error("Missing required key: API");
    }

    const method = String(caseData.method || "POST").toUpperCase();
    const payload = caseData.payload ?? {};

    const headers = {
        "Content-Type": "application/json",
    };

    if (caseData.headers && typeof caseData.headers === "object" && !Array.isArray(caseData.headers)) {
        for (const [key, value] of Object.entries(caseData.headers)) {
            headers[String(key)] = String(value);
        }
    }

    let body;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        body = JSON.stringify(payload);
    }

    return { method, url, headers, body };
}

async function callApi(requestData, timeoutSeconds) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);

    try {
        const response = await fetch(requestData.url, {
            method: requestData.method,
            headers: requestData.headers,
            body: requestData.body,
            signal: controller.signal,
        });

        const body = await response.text();
        return { status: String(response.status), body };
    } catch (error) {
        return { status: "REQUEST_FAILED", body: error.message };
    } finally {
        clearTimeout(timeoutId);
    }
}

function loadCase(filePath) {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
}

async function runFile(filePath, timeoutSeconds, previewChars) {
    let requestData;
    let caseData;
    try {
        caseData = loadCase(filePath);
        requestData = buildRequestFromCase(caseData);
    } catch (error) {
        return {
            fileSuccess: false,
            totalGenerators: 0,
            generatorSuccess: 0,
            generatorUnsuccess: 0,
        };
    }

    const result = await callApi(requestData, timeoutSeconds);
    const generatorStats = getGeneratorStats(caseData, result.status, result.body);
    const isSuccess = generatorStats.generatorFailed === 0
        && /^\d+$/.test(result.status)
        && Number(result.status) >= 200
        && Number(result.status) < 300;

    return {
        fileSuccess: isSuccess,
        totalGenerators: generatorStats.totalGenerators,
        generatorSuccess: generatorStats.generatorSuccess,
        generatorUnsuccess: generatorStats.generatorFailed,
    };
}

async function main() {
    let args;
    try {
        args = parseArgs(process.argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    const files = resolveFiles(args.input);
    if (files.length === 0) {
        console.log("Total Files: 0");
        console.log("Success: 0");
        console.log("Unsuccess: 0");
        process.exit(1);
    }

    let successCount = 0;
    let totalGenerators = 0;
    let totalGeneratorSuccess = 0;
    let totalGeneratorUnsuccess = 0;

    for (const filePath of files) {
        const runResult = await runFile(filePath, args.timeout, args.previewChars);
        if (runResult.fileSuccess) {
            successCount += 1;
        }
        totalGenerators += runResult.totalGenerators;
        totalGeneratorSuccess += runResult.generatorSuccess;
        totalGeneratorUnsuccess += runResult.generatorUnsuccess;
    }

    const total = files.length;
    const unsuccessCount = total - successCount;

    console.log(`Total Files: ${total}`);
    console.log(`Success: ${successCount}`);
    console.log(`Unsuccess: ${unsuccessCount}`);

    process.exit(unsuccessCount === 0 ? 0 : 2);
}

main();

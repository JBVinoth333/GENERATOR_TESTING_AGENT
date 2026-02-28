const fs = require("fs");
const path = require("path");

const REQUEST_TIMEOUT_MS = 90000;
const REQUIRED_KEYS = [
    "API_URL",
    "SCENARIO_NAME",
    "ORG_ID",
    "IAM_URL",
    "HOST",
    "REFRESH_TOKEN",
    "CLIENT_ID",
    "CLIENT_SECRET",
    "ORG_CLIENT_ID",
    "ORG_CLIENT_SECRET",
    "ORG_REFRESH_TOKEN",
    "EMAIL",
    "PASSWORD",
    "GENERATOR_FILE"
];

function resolveConfigFile() {
    if (process.env.SECRET_PROPERTIES_FILE) {
        return path.resolve(__dirname, process.env.SECRET_PROPERTIES_FILE);
    }

    const candidates = [
        path.resolve(__dirname, "source/secret.properties"),
        path.resolve(__dirname, "TestingAPI/secret.properties")
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    throw new Error("secret.properties not found. Expected source/secret.properties or TestingAPI/secret.properties");
}

function parseProperties(rawText) {
    const parsed = {};
    for (const line of rawText.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) {
            continue;
        }

        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex === -1) {
            continue;
        }

        parsed[trimmed.slice(0, separatorIndex).trim()] = trimmed.slice(separatorIndex + 1).trim();
    }

    return parsed;
}

function loadGeneratorTemplates(generatorFilePath, generatorKey) {
    const generatorPath = path.resolve(__dirname, generatorFilePath);
    const generatorConfig = JSON.parse(fs.readFileSync(generatorPath, "utf8"));

    const generators = generatorConfig?.generators;
    if (!generators || typeof generators !== "object") {
        throw new Error("Invalid generator file: missing generators object");
    }

    const selectedKey = generatorKey || Object.keys(generators)[0];
    const templates = generators[selectedKey];
    if (!selectedKey || !Array.isArray(templates)) {
        throw new Error(`Invalid generator file: missing generators.${selectedKey || "<key>"} array`);
    }

    return templates;
}

function buildPayload(config) {
    return {
        scenario_name: config.SCENARIO_NAME,
        data_generation_templates: config.DATA_GENERATOR,
        account: {
            storeVariables: { orgId: config.ORG_ID },
            authentications: ["org-oauth"],
            oauth2: {
                refreshToken: config.REFRESH_TOKEN,
                clientId: config.CLIENT_ID,
                clientSecret: config.CLIENT_SECRET
            },
            org_oauth: {
                clientId: config.ORG_CLIENT_ID,
                clientSecret: config.ORG_CLIENT_SECRET,
                refreshToken: config.ORG_REFRESH_TOKEN
            },
            email: config.EMAIL,
            password: config.PASSWORD
        },
        environmentDetails: {
            iam_url: config.IAM_URL,
            host: config.HOST
        }
    };
}

function loadConfig() {
    const configFile = resolveConfigFile();
    const config = parseProperties(fs.readFileSync(configFile, "utf8"));
    for (const key of REQUIRED_KEYS) {
        if (!config[key]) {
            throw new Error(`Missing required key in ${configFile}: ${key}`);
        }
    }

    config.DATA_GENERATOR = loadGeneratorTemplates(config.GENERATOR_FILE, config.GENERATOR_KEY);
    return config;
}

async function callApi(apiUrl, payload) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        const text = await response.text();
        console.log("Status:", response.status);

        try {
            const data = JSON.parse(text);
            console.log("POST Response:");
            console.log(JSON.stringify(data, null, 2));
        } catch {
            console.log("POST Response (raw):", text);
        }

        return response.ok ? 0 : 2;
    } finally {
        clearTimeout(timeoutId);
    }
}

async function main() {
    try {
        const config = loadConfig();
        const payload = buildPayload(config);
        const exitCode = await callApi(config.API_URL, payload);
        process.exit(exitCode);
    } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}

main();

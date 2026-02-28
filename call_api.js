const fs = require("fs");

async function main() {
    try {
        const generatorFile = process.argv[2] || "Generators/create_skill/test_data_generation_configurations.json";
        const generatorConfig = JSON.parse(fs.readFileSync(generatorFile, "utf8"));
        const generatorKey = process.argv[3] || Object.keys(generatorConfig?.generators || {})[0];
        const dataGenerationTemplates = generatorConfig?.generators?.[generatorKey];

        if (!Array.isArray(dataGenerationTemplates)) {
            throw new Error(`Invalid generator configuration: generators.${generatorKey} is missing or not an array`);
        }

        const payload = {
            scenario_name: "Disassociate department for product",
            data_generation_templates: dataGenerationTemplates,
            account: {
                storeVariables: { orgId: "20408511" },
                authentications: ["org-oauth"],
                oauth2: {
                    refreshToken: "1000.24f1d228f80c048828052b6580d3506d.8836c41a3e4c8eaad496d61f9478e963",
                    clientId: "1000.N7LVXZ2CGH1I15VU1G5FI1SAYTHLLT",
                    clientSecret: "7c0547468a63882dc031adc40168b8b1e1621a7d0b"
                },
                org_oauth: {
                    clientId: "1005.DU2NG56TMGTGERTB0V5W1EJ9FMULXZ",
                    clientSecret: "0d201da58c370d0b7b5668b389cb4115a209a7d40b",
                    refreshToken: "1005.ab4f960dfb0b3e40ddbda1b610235151.befab27e15db2241c4ca713c37cfc8e2"
                },
                email: "anitha.m+uat@zohotest.com",
                password: "Desk@4321"
            },
            environmentDetails: {
                iam_url: "https://accounts.csez.zohocorpin.com",
                host: "https://zdesk-devops25.csez.zohocorpin.com:31037"
            }
        };

        const response = await fetch("https://uat-data-generator.zdesk.csez.zohocorpin.com/api/v1/data-generator/generate-data?for=template", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        console.log("Status:", response.status);

        try {
            console.log("POST Response:");
            console.log(JSON.stringify(JSON.parse(text), null, 2));
        } catch {
            console.log("POST Response (raw):", text);
        }

        return response.ok ? 0 : 2;
    } catch (error) {
        console.error("Error:", error.message);
        return 1;
    }
}

main().then((exitCode) => process.exit(exitCode));

const fs = require("fs");
const URL = "https://uat-data-generator.zdesk.csez.zohocorpin.com/api/v1/data-generator/generate-data?for=template";
const REFRESH_TOKEN = "1000.24f1d228f80c048828052b6580d3506d.8836c41a3e4c8eaad496d61f9478e963";
const CLIENT_ID = "1000.N7LVXZ2CGH1I15VU1G5FI1SAYTHLLT";
const CLIENT_SECRET = "7c0547468a63882dc031adc40168b8b1e1621a7d0b";
const ORG_OAUTH_CLIENT_ID = "1005.DU2NG56TMGTGERTB0V5W1EJ9FMULXZ";
const ORG_OAUTH_CLIENT_SECRET = "0d201da58c370d0b7b5668b389cb4115a209a7d40b";
const ORG_OAUTH_REFRESH_TOKEN = "1005.ab4f960dfb0b3e40ddbda1b610235151.befab27e15db2241c4ca713c37cfc8e2";
const EMAIL = "anitha.m+uat@zohotest.com";
const PASSWORD = "Desk@4321";
const IAM_URL = "https://accounts.csez.zohocorpin.com";
const HOST = "https://zdesk-devops25.csez.zohocorpin.com:31037";
const ORG_ID = "20408511";
const SCENARIO_NAME = "Create Ticket with Description as Current Date Time ";
const DATA_GENERATORS = [
    {
        "type": "remote",
        "generatorMethod": "applicationDriver.rpc.desk.DynamicDataProvider.getDateTime",
        "name": "description_value",
        "inputs": {
            "format": "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "timeLine": "current"
        }
    },
    {
        "type": "dynamic",
        "generatorOperationId": "support.Ticket.createTicket",
        "dataPath": "$.response.body:$",
        "name": "tickets",
        "params": {
            "description": "$description_value.value"
        }
    }
];



async function main() {
    const payload = {
        scenario_name: SCENARIO_NAME,
        data_generation_templates: DATA_GENERATORS,
        account: {
            storeVariables: { orgId: ORG_ID },
            authentications: ["org-oauth"],
            oauth2: {
                refreshToken: REFRESH_TOKEN,
                clientId: CLIENT_ID,
                clientSecret: CLIENT_SECRET
            },
            org_oauth: {
                clientId: ORG_OAUTH_CLIENT_ID,
                clientSecret: ORG_OAUTH_CLIENT_SECRET,
                refreshToken: ORG_OAUTH_REFRESH_TOKEN
            },
            email: EMAIL,
            password: PASSWORD
        },
        environmentDetails: {
            iam_url: IAM_URL,
            host: HOST
        }
    };

    const response = await fetch(URL, {
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
}
main().then((exitCode) => process.exit(exitCode));

import chromium from "chrome-aws-lambda";
import { join } from "path";
import { readFileSync } from "fs";
import { compile as handlebarsCompile } from "handlebars";
import dayjs from "dayjs";

import { document } from "../utils/dynamodbClient";

interface ICreateCertificate {
    id: string;
    name: string;
    grade: string;
}

interface ITemplate {
    id: string;
    name: string;
    grade: string;
    date: string;
    medal: string;
}

const compile = async function(data: ITemplate) {
    const filePath = join(process.cwd(), "src", "templates", "certificate.hbs");

    const html = readFileSync(filePath, "utf-8");

    return handlebarsCompile(html)(data);
}

export const handle = async (event) => {
    const { id, name, grade } = JSON.parse(event.body) as ICreateCertificate;

    await document.put({
        TableName: "users_certificates",
        Item: {
            id,
            name,
            grade,
        }
    }).promise();

    const medalPath = join(process.cwd(), "src", "templates", "selo.png");
    const medal = readFileSync(medalPath, "base64");

    const data: ITemplate = {
        date: dayjs().format("DD/MM/YYY"),
        grade,
        name,
        id,
        medal,
    };

    const content = await compile(data);

    return {
        statusCode: 201,
        body: JSON.stringify({
            message: "Certificate created!",
        }),
        headers: {
            "Content-Type": "application/json",
        },
    };
};
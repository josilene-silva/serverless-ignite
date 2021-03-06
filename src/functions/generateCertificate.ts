import { puppeteer, args, defaultViewport, executablePath } from "chrome-aws-lambda";
import { join } from "path";
import { readFileSync } from "fs";
import { compile as handlebarsCompile } from "handlebars";
import dayjs from "dayjs";
import { S3 } from "aws-sdk";

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

    const response = await document.query({
        TableName: "users_certificates",
        KeyConditionExpression: "id = :id",
        ExpressionAttributeValues: {
            ":id": id,
        }
    }).promise();

    const userAlreadyExists = response.Items[0];

    if(!userAlreadyExists) {
        await document.put({
            TableName: "users_certificates",
            Item: {
                id,
                name,
                grade,
            }
        }).promise();
    }

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

    const browser = await puppeteer.launch({
        headless: true, // default
        args,
        defaultViewport,
        executablePath: await executablePath,
    });

    const page = await browser.newPage();

    await page.setContent(content);

    const pdf = await page.pdf({
        format: "a4",
        landscape: true,
        path: process.env.IS_OFFLINE ? "certificate.pdf": null,
        printBackground: true,
        preferCSSPageSize: true,
    });

    await browser.close();

    const s3 = new S3();

    await s3.putObject({
        Bucket: "serverlesscertificatesignite-josi",
        Key: `${id}.pdf`,
        ACL: "public-read",
        Body: pdf,
        ContentType: "application/pdf",
    }).promise();

    return {
        statusCode: 201,
        body: JSON.stringify({
            message: "Certificate created!",
            url: `https://serverlesscertificatesignite-josi.s3.sa-east-1.amazonaws.com/${id}.pdf`,
        }),
        headers: {
            "Content-Type": "application/json",
        },
    };
};
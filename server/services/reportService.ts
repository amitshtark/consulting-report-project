// Make sure you've reviewd the README.md file to understand the task and how to access the relevant resources

import SalesforceData from '../models/SalesforceData.ts';
import { GoogleGenAI } from '@google/genai';

//creating cache

const reportCache = new Map<string, {report: string, expiresAt: number}>();


const gemini = new GoogleGenAI({}); // initializes the Gemini client and automatically loads the API key from the .env file



const askGemini = async (userPrompt: string) => {
  const response = await gemini.interactions.create({
    model: "gemini-3.5-flash-lite",
    input: userPrompt,
    generation_config: {
      thinking_level: "low",
    },
  },
{
  timeout_ms: 30000, // 30 seconds timeout
}
);

  return {
    text: response.output_text,
    tokens: response.usage,
  };
};


export const generateReportMarkdown = async (
  companyName: string,
  companyId: string,
  reportType: string
): Promise<string> => {

  const cacheKey = `${companyId}:${reportType}`;
  const cached = reportCache.get(cacheKey);
  if( cached && cached.expiresAt > Date.now()) {
    console.log('Returning cached report');
    return cached.report;
  }

    console.log('starting report generation');


    const companyData = await SalesforceData.findAll({
      where: {
        companyName: companyName},
        order: [['year', 'DESC']]
    })
    if (!companyData || companyData.length === 0) {
      throw new Error(`No data found for company: ${companyName}`);
    }
    const growthData: { year: number; growth: number }[] = [];
    for(let i = 0; i < companyData.length-1; i++)
    {
      if(companyData[i+1].sales == 0) continue;
      growthData.push({year: companyData[i].year, growth: (companyData[i].sales / companyData[i+1].sales - 1) * 100})
    }

    console.log('DB data retrieved, fetching news data');



  const response = await fetch(`https://news-api.jona-581.workers.dev/?id=${companyId}`, {
    signal: AbortSignal.timeout(10000), // 10 seconds timeout
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch news data: ${response.statusText}`);
  }
  const data = await response.json();

  console.log('News data retrieved, generating report');
  
  
  const prompt = `
  You are a professional financial investment analyst.

  Generate an investment report for:
  Company: ${companyName}
  Company ID: ${companyId}
  Report Type: ${reportType}

  Financial Data:
  ${JSON.stringify(companyData, null, 2)}

  Sales Growth Data:
  ${JSON.stringify(growthData, null, 2)}

  Recent News:
  ${JSON.stringify(data, null, 2)}

  ANALYSIS RULES:
  1. Analyze financial performance, profitability, growth, and recent news.
  2. If recent news contains newer financial information that contradicts the database, prioritize the newer information and explain the discrepancy.
  3. Base your analysis only on the provided data. Never invent facts or numbers.
  4. Choose exactly one investment recommendation:
    - Invest
    - Don't Invest
    - Defer
  5. Base the recommendation on both financial performance and recent developments.
  6. Return only Markdown. Do not use code fences.
  7. Do not repeat the company name or create a main report title, as these are already added by the application.

  REPORT FORMAT:

  If reportType is "high-level":
  - Return exactly two Markdown paragraphs separated by a blank line.
  - First paragraph: **Investment Recommendation: [Invest / Don't Invest / Defer]**
  - Second paragraph: **Reason:** followed by one concise sentence (maximum 35 words).
  - Do not include headings or additional explanations.

  Example:
  **Investment Recommendation: Defer**

  **Reason:** Despite strong revenue growth, recent regulatory fines create significant risks.

  If reportType is "detailed":
  - Begin with **Investment Recommendation: [chosen recommendation]**.
  - Include the following Markdown sections:
    ## Financial Performance
    ## Recent News and Developments
    ## Risks and Opportunities
    ## Final Assessment
  - Explain the reasoning behind the recommendation using specific available data.
  - Clearly identify any conflicts between financial data and newer news.

  Example detailed output:
  **Investment Recommendation: Defer**

  ## Financial Performance
  Revenue increased between 2021 and 2023, indicating positive historical growth.

  ## Recent News and Developments
  Recent regulatory penalties may affect future operations.

  ## Risks and Opportunities
  Growth presents opportunities, but regulatory concerns introduce uncertainty.

  ## Final Assessment
  Defer investment until there is more clarity regarding the company's regulatory situation.

  IMPORTANT:
  Follow the format corresponding to reportType exactly.
  `;




  console.time('Gemini');
  const geminiResponse = await askGemini(prompt);
  console.timeEnd('Gemini');


  if (!geminiResponse || !geminiResponse.text) {
    throw new Error('Failed to generate report using Gemini API');
  }

  console.log('Report generated successfully \n\n');

  const placeholderMarkdown =
    `# ${companyName} — Investment Report` +
    `\n**${companyId}**: *${reportType}*\n\n` +
    `${geminiResponse.text}`;

  reportCache.set(cacheKey, { report: placeholderMarkdown, expiresAt: Date.now() + 10 * 60 * 1000 }); // Cache for 10 minutes
  return placeholderMarkdown;
};





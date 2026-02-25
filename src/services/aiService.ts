import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const generateDescription = async (prompt: string): Promise<string> => {
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Error generating description:', error);
        throw new Error('Failed to generate description');
    }
};

export const generateEndpointDocs = async (
    method: string,
    url: string,
    body?: any,
    response?: any,
    userCommand?: string
): Promise<{ name: string; description: string }> => {
    const prompt = `
    You are an expert API documentation assistant. Based on the following endpoint details and the optional user command, generate a valid JSON object containing a 'name' and 'description'.

    ENDPOINT DETAILS:
    Method: ${method}
    URL: ${url}
    ${body ? `Request Body: ${JSON.stringify(body)}` : ''}
    ${response ? `Response Example: ${JSON.stringify(response)}` : ''}

    USER COMMAND:
    ${userCommand || 'Generate a professional name and a simple, clear description explaining what the request does and what the response means.'}

    REQUIREMENTS:
    - 'name': Valid, meaningful, max 5-6 words.
    - 'description': Simple, clear, explaining both request and response.
    - RETURN ONLY A VALID JSON OBJECT with 'name' and 'description' keys. Do not include markdown formatting or extra text.
    `;

    const rawResult = await generateDescription(prompt);
    try {
        const cleaned = rawResult.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (error) {
        return {
            name: `${method} ${url.split('/').pop() || 'Request'}`,
            description: rawResult
        };
    }
};

export const generateTests = async (
    method: string,
    url: string,
    response: any
): Promise<any[]> => {
    const prompt = `
    You are an expert API Quality Engineer. Based on the following API response, generate a list of meaningful test assertions.
    
    API DETAILS:
    Method: ${method}
    URL: ${url}
    Response: ${JSON.stringify(response, null, 2)}
    
    ASSERTION TYPES AVAILABLE:
    - 'status_code': Check if status code matches (expected is a number string, e.g., "200")
    - 'response_time': Check if response is fast (expected is max ms, e.g., "500")
    - 'body_contains': Check if raw body contains a string
    - 'json_value': Check a specific JSON property using dot-path (e.g., "data.id"). 'property' field is required for this type.
    
    REQUIREMENTS:
    - Generate 3-5 useful assertions.
    - RETURN ONLY A VALID JSON ARRAY of objects with fields: 'id' (random string), 'type', 'expected', and 'property' (optional).
    - Do not include markdown formatting.
    `;

    const rawResult = await generateDescription(prompt);
    try {
        const cleaned = rawResult.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (error) {
        console.error('Failed to parse AI tests:', rawResult);
        return [{ id: Math.random().toString(36), type: 'status_code', expected: '200' }];
    }
};

export const generateRequest = async (
    userPrompt: string
): Promise<any> => {
    const prompt = `
    You are an API Request builder. Convert the user's natural language request into a structured API request object.
    
    USER PROMPT: "${userPrompt}"
    
    REQUIREMENTS:
    - RETURN ONLY A VALID JSON OBJECT with these optional fields:
      - 'method': 'GET', 'POST', 'PUT', 'DELETE', or 'PATCH'
      - 'url': The URL or path
      - 'headers': Array of { key: string, value: string }
      - 'body': { mode: 'raw', raw: string } (if applicable)
      - 'name': A short name for the request
    - If the user doesn't specify a method, infer the most likely one.
    - If no URL is provided, leave it blank.
    - Do not include markdown formatting.
    `;

    const rawResult = await generateDescription(prompt);
    try {
        const cleaned = rawResult.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (error) {
        console.error('Failed to parse AI request:', rawResult);
        return { method: 'GET', url: '', name: 'AI Generated Request' };
    }
};

export const explainError = async (
    url: string,
    method: string,
    error: any
): Promise<string> => {
    const prompt = `
    You are an API Debugging Assistant. Help the user understand why their API request failed and suggest a fix.
    
    REQUEST: ${method} ${url}
    ERROR DATA: ${JSON.stringify(error, null, 2)}
    
    REQUIREMENTS:
    - Provide a concise (max 3-4 sentences) explanation of what likely went wrong.
    - Provide 1-2 actionable steps to fix it.
    - Format as a simple text message. No markdown blocks.
    `;

    return await generateDescription(prompt);
};

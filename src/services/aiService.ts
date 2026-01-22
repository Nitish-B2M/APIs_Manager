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
        // Clean up markdown code blocks if AI included them
        const cleaned = rawResult.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (error) {
        console.error('Failed to parse AI response as JSON:', rawResult);
        return {
            name: `${method} ${url.split('/').pop() || 'Request'}`,
            description: rawResult
        };
    }
};

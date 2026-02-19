interface SnippetInput {
    method: string;
    url: string;
    headers: { key: string; value: string }[];
    body?: { mode: string; raw: string };
}

export function generateCurl(input: SnippetInput): string {
    const { method, url, headers, body } = input;
    let cmd = `curl -X ${method.toUpperCase()} '${url}'`;

    headers.forEach(h => {
        if (h.key && h.value) {
            cmd += ` \\\n  -H '${h.key}: ${h.value}'`;
        }
    });

    if (body?.raw && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        cmd += ` \\\n  -d '${body.raw.replace(/'/g, "\\'")}'`;
    }

    return cmd;
}

export function generateFetch(input: SnippetInput): string {
    const { method, url, headers, body } = input;
    const headerObj: Record<string, string> = {};
    headers.forEach(h => { if (h.key && h.value) headerObj[h.key] = h.value; });

    let code = `const response = await fetch('${url}', {\n  method: '${method.toUpperCase()}',\n`;

    if (Object.keys(headerObj).length > 0) {
        code += `  headers: ${JSON.stringify(headerObj, null, 4).replace(/\n/g, '\n  ')},\n`;
    }

    if (body?.raw && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        code += `  body: JSON.stringify(${body.raw}),\n`;
    }

    code += `});\n\nconst data = await response.json();\nconsole.log(data);`;
    return code;
}

export function generatePython(input: SnippetInput): string {
    const { method, url, headers, body } = input;

    let code = `import requests\n\n`;
    code += `url = "${url}"\n`;

    const headerObj: Record<string, string> = {};
    headers.forEach(h => { if (h.key && h.value) headerObj[h.key] = h.value; });

    if (Object.keys(headerObj).length > 0) {
        code += `headers = ${JSON.stringify(headerObj, null, 4)}\n`;
    }

    if (body?.raw && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        code += `payload = ${body.raw}\n\n`;
        code += `response = requests.${method.toLowerCase()}(url${Object.keys(headerObj).length > 0 ? ', headers=headers' : ''}, json=payload)\n`;
    } else {
        code += `\nresponse = requests.${method.toLowerCase()}(url${Object.keys(headerObj).length > 0 ? ', headers=headers' : ''})\n`;
    }

    code += `print(response.json())`;
    return code;
}

export function generateGo(input: SnippetInput): string {
    const { method, url, headers, body } = input;

    let code = `package main\n\nimport (\n    "fmt"\n    "io"\n    "net/http"\n`;
    if (body?.raw && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        code += `    "strings"\n`;
    }
    code += `)\n\nfunc main() {\n`;

    if (body?.raw && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        code += `    payload := strings.NewReader(\`${body.raw}\`)\n`;
        code += `    req, err := http.NewRequest("${method.toUpperCase()}", "${url}", payload)\n`;
    } else {
        code += `    req, err := http.NewRequest("${method.toUpperCase()}", "${url}", nil)\n`;
    }

    code += `    if err != nil {\n        panic(err)\n    }\n\n`;

    headers.forEach(h => {
        if (h.key && h.value) {
            code += `    req.Header.Set("${h.key}", "${h.value}")\n`;
        }
    });

    code += `\n    client := &http.Client{}\n`;
    code += `    resp, err := client.Do(req)\n`;
    code += `    if err != nil {\n        panic(err)\n    }\n`;
    code += `    defer resp.Body.Close()\n\n`;
    code += `    body, _ := io.ReadAll(resp.Body)\n`;
    code += `    fmt.Println(string(body))\n}`;

    return code;
}

export function generatePhp(input: SnippetInput): string {
    const { method, url, headers, body } = input;

    let code = `<?php\n\n$curl = curl_init();\n\ncurl_setopt_array($curl, [\n`;
    code += `    CURLOPT_URL => "${url}",\n`;
    code += `    CURLOPT_RETURNTRANSFER => true,\n`;
    code += `    CURLOPT_CUSTOMREQUEST => "${method.toUpperCase()}",\n`;

    if (body?.raw && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        code += `    CURLOPT_POSTFIELDS => '${body.raw.replace(/'/g, "\\'")}',\n`;
    }

    const headerLines = headers
        .filter(h => h.key && h.value)
        .map(h => `        "${h.key}: ${h.value}"`);

    if (headerLines.length > 0) {
        code += `    CURLOPT_HTTPHEADER => [\n${headerLines.join(',\n')}\n    ],\n`;
    }

    code += `]);\n\n$response = curl_exec($curl);\n$err = curl_error($curl);\ncurl_close($curl);\n\n`;
    code += `if ($err) {\n    echo "Error: " . $err;\n} else {\n    echo $response;\n}\n?>`;

    return code;
}

export function generateAllSnippets(input: SnippetInput): Record<string, string> {
    return {
        curl: generateCurl(input),
        javascript: generateFetch(input),
        python: generatePython(input),
        go: generateGo(input),
        php: generatePhp(input),
    };
}

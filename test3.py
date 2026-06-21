from openai import OpenAI

client = OpenAI(
    api_key="sk-4347694344094aa998bf45736ba36bf7",
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "user", "content": "Say hello"}
    ]
)

print(response.choices[0].message.content)
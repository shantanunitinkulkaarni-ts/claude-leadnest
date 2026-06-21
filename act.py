from openai import OpenAI
import os

client = OpenAI(
    api_key=os.environ["sk-4347694344094aa998bf45736ba36bf7"],
    base_url="https://api.deepseek.com"
)

while True:
    prompt = input("You: ")

    if prompt.lower() == "exit":
        break

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {
                "role": "system",
                "content": "You are an expert software engineer."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    print("\nAI:", response.choices[0].message.content)
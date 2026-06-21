with open("app.py", "r", encoding="utf-8") as f:
    code = f.read()

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {
            "role": "user",
            "content": f"Find bugs in this code:\n\n{code}"
        }
    ]
)

print(response.choices[0].message.content)
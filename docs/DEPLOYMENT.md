# Deployment (Vercel)

The web app and the chatbot API deploy together as one Vercel project. The free (Hobby) plan is enough.

## First deployment

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Import the repository **toyota-kms-prototype**.
3. In **Root Directory** choose `web`. Vercel detects **Vite** automatically
   (build `npm run build`, output `dist`). Leave the rest as is.
4. Click **Deploy**. After about a minute you get a URL like `https://toyota-kms-prototype.vercel.app`.
5. Check `https://<your-url>/api/health` — it should return `{"status":"ok","documents":72,...}`.

Every push to `main` redeploys automatically.

## Optional: LLM-written answers

The chatbot works without any key (extractive answers). To let a language model write the answer from the same
retrieved documents, add these in **Project → Settings → Environment Variables** and redeploy:

| Variable | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | your API key |
| `LLM_MODEL` | optional, defaults to `claude-haiku-5-5` |

If the key is missing or the service fails, the chatbot falls back to the extractive answer automatically.

## Updating the knowledge

1. Edit `data/documents.json` or `data/concepts.json`.
2. `cd ml && python build_artifacts.py && python knowledge_graph.py`
3. `cd ../web && npm run evaluate` (refreshes the metrics)
4. Commit and push.

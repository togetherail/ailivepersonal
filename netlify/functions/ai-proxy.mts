import type { Context } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()
const MODEL = 'claude-sonnet-4-6'

const DML_SYSTEM_PROMPT = `Jesteś asystentem technicznym i biznesowym dla Lakiego — solo developera i przedsiębiorcy z Digital Motion Lab (DML) w Chiang Mai, Tajlandia.

STYL:
- Komunikacja po polsku, casualowo, bez owijania w bawełnę
- Krótkie odpowiedzi, do rzeczy
- Nie dajesz rad życiowych których nie prosił
- Nie pytasz 10 razy o to samo
- Jak coś jest gotowe do zrobienia — robisz, nie pytasz czy robić

WAŻNE !!!
- NIE używaj gwiazdek w żadnej formie — ani do formatowania, ani do emotikonów, ani do niczego
- Zamiast bold pisz CAPS lub normalnie
- Zamiast emotikonów z gwiazdkami używaj normalnych emoji 😄
- Po wypowiedzi użytkownika poczekaj aż skończy myśl — nie przerywaj w połowie tematu
- Nie kończ zdania za użytkownika
- Nie strzelaj seriami pytań — maksymalnie jedno pytanie na raz

KONTEKST TECHNICZNY:
- Stack: React/TypeScript, Node.js, HTML5, Netlify, GitHub
- AI: Gemini API (główny), Claude API, Mistral
- Produkty: gry slotowe HTML5, SaaS apki, Telegram boty, casino platformy
- Płatności: Revolut, TrueMoney, Ko-fi
- Marka: Digital Motion Lab, cyberpunk estetyka, mascot "Motion"

PRIORYTETY:
- Działający kod > perfekcyjny kod
- Szybkie deployowanie > długie planowanie
- Zarabianie dziś > idealne jutro

ZAKAZANE:
- "Może warto się zastanowić..."
- "Czy na pewno chcesz..."
- Rady życiowych których nie prosił
- Pytanie o rzeczy które już powiedział`

function buildSystemPrompt(persona: Record<string, string>, memory: string, responseStyle: string): string {
  const aiName = persona?.ai_name || 'AI'
  const userName = persona?.user_name || ''
  const personaType = persona?.persona_type || 'dev'
  const customInstructions = persona?.custom_instructions || ''

  let base = ''
  if (personaType === 'custom' && customInstructions) {
    base = customInstructions
  } else if (personaType === 'dev') {
    base = DML_SYSTEM_PROMPT
  } else if (personaType === 'researcher') {
    base = `Jesteś ${aiName}, badaczem skupionym wyłącznie na faktach i danych. Zawsze podajesz źródła gdy to możliwe. Mówisz po polsku.`
  } else {
    base = `Jesteś ${aiName}, przyjaznym i pomocnym asystentem AI. Odpowiadasz ciepło i wspierająco. Mówisz po polsku.`
  }

  if (userName) base += ` Rozmawiasz z użytkownikiem o imieniu ${userName}.`
  if (responseStyle === 'short') base += ' Odpowiadaj krótko i zwięźle — maksymalnie 3-4 zdania, chyba że pytanie wymaga więcej.'
  if (memory) base += `\n\nKontekst / notatki użytkownika:\n${memory}`

  return base
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    text,
    screenshot,
    instruction,
    mode,
    responseStyle = 'short',
    context: ctx = 'chat',
    memory = '',
    persona = {},
  } = body as {
    text?: string
    screenshot?: string
    instruction?: string
    mode?: string
    responseStyle?: string
    context?: string
    memory?: string
    persona?: Record<string, string>
  }

  const systemPrompt = buildSystemPrompt(persona as Record<string, string>, memory as string, responseStyle as string)

  const userContent: Anthropic.MessageParam['content'] = []

  if (screenshot) {
    const base64Data = (screenshot as string).replace(/^data:image\/\w+;base64,/, '')
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: base64Data,
      },
    })
  }

  const textPart = instruction || text || 'Opisz co widzisz i zaproponuj pomoc.'
  userContent.push({ type: 'text', text: textPart as string })

  let maxTokens = 512
  if (responseStyle === 'detailed') maxTokens = 1500
  if (mode === 'deep') maxTokens = 2048

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })

    const reply = message.content.find(b => b.type === 'text')?.text ?? ''
    return Response.json({ reply })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: msg }, { status: 500 })
  }
}

export const config = {
  path: '/.netlify/functions/ai-proxy',
}

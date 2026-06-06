import asyncio
import json
from backend.config import settings

try:
    from openai import OpenAI
    _client = OpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None
except Exception:
    _client = None

_MODEL = "gpt-4o-mini"

EXPLANATION_SYSTEM = (
    "You are a Blood Warriors AI coordinator. Generate a 2-sentence plain-English explanation "
    "for why this donor is recommended for a blood match. Be specific, warm, and factual. "
    "Mention the most important positive signals. Keep under 60 words."
)

CHAT_SYSTEM = """You are Blood Warriors AI — a compassionate coordinator connecting blood donors with
Thalassemia patients in Hyderabad, India. You speak English, Hindi, and Telugu fluently.
Detect the donor's language from their message and respond in the same language.
Be warm, concise (WhatsApp-style), and never guilt-trip.
After your conversational reply, return a JSON object on the last line:
{{"intent": "CONFIRM|DECLINE|DEFER|QUESTION|OPT_OUT", "language": "English|Hindi|Telugu"}}

Donor profile: {donor_profile}
Current flow: {flow}"""


def _build_explanation_prompt(donor: dict, patient_blood_group: str, transfusion_date: str) -> str:
    return (
        f"Patient needs {patient_blood_group} blood on {transfusion_date}. "
        f"Donor: {donor.get('blood_group')} blood group, {donor.get('donor_type')}, "
        f"{donor.get('donations_till_date', 0)} lifetime donations, "
        f"{donor.get('distance_km', '?')} km away, "
        f"calls-to-donation ratio: {donor.get('calls_to_donations_ratio', 0):.1f}, "
        f"KAG score: {donor.get('score', 0):.2f}/1.0. "
        f"Explain why this donor is recommended."
    )


def generate_explanation_sync(donor: dict, patient_blood_group: str, transfusion_date: str) -> str:
    if not _client:
        return (
            f"{donor.get('blood_group')} donor with {donor.get('donations_till_date', 0)} donations, "
            f"{donor.get('distance_km', '?')} km away. Score: {donor.get('score', 0):.2f}/1.0."
        )
    try:
        resp = _client.chat.completions.create(
            model=_MODEL,
            max_tokens=120,
            messages=[
                {"role": "system", "content": EXPLANATION_SYSTEM},
                {"role": "user", "content": _build_explanation_prompt(donor, patient_blood_group, transfusion_date)},
            ],
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return f"Match score {donor.get('score', 0):.2f} — {donor.get('blood_group')} {donor.get('donor_type')} donor."


async def generate_all_explanations(candidates: list[dict], patient_blood_group: str, transfusion_date: str) -> list[str]:
    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(None, generate_explanation_sync, donor, patient_blood_group, str(transfusion_date))
        for donor in candidates
    ]
    return await asyncio.gather(*tasks)


def chat_with_donor_sync(
    user_id: str,
    message: str,
    history: list[dict],
    donor_profile: dict,
    flow: str = "outreach",
) -> dict:
    if not _client:
        return {
            "reply": "Thank you for your message! (Demo mode — add OPENAI_API_KEY to enable AI responses)",
            "intent": "QUESTION",
            "language": "English",
        }

    profile_str = (
        f"Blood group: {donor_profile.get('blood_group', 'Unknown')}, "
        f"Donor type: {donor_profile.get('donor_type', 'Unknown')}, "
        f"Donations: {donor_profile.get('donations_till_date', 0)}, "
        f"Next eligible: {donor_profile.get('next_eligible_date', 'Unknown')}"
    )

    system = CHAT_SYSTEM.format(donor_profile=profile_str, flow=flow)

    messages = [{"role": "system", "content": system}]
    messages += history[-6:]
    messages.append({"role": "user", "content": message})

    try:
        resp = _client.chat.completions.create(
            model=_MODEL,
            max_tokens=300,
            messages=messages,
        )
        raw = resp.choices[0].message.content.strip()
        lines = raw.split("\n")
        intent = "QUESTION"
        language = "English"
        reply_lines = lines

        for i in range(len(lines) - 1, -1, -1):
            line = lines[i].strip()
            if line.startswith("{") and line.endswith("}"):
                try:
                    parsed = json.loads(line)
                    intent = parsed.get("intent", "QUESTION")
                    language = parsed.get("language", "English")
                    reply_lines = lines[:i]
                    break
                except Exception:
                    pass

        reply = "\n".join(reply_lines).strip()
        return {"reply": reply, "intent": intent, "language": language}
    except Exception:
        return {"reply": "I'm here to help! Please try again.", "intent": "QUESTION", "language": "English"}

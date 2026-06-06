"""
Twilio SMS/WhatsApp sender.
Trial accounts can only message verified numbers — uses SMS fallback automatically.
"""
from backend.config import settings

try:
    from twilio.rest import Client as TwilioClient
    _client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN) if settings.TWILIO_ACCOUNT_SID else None
except Exception:
    _client = None

_FROM = settings.TWILIO_FROM_NUMBER


def _whatsapp(number: str) -> str:
    return f"whatsapp:{number}" if not number.startswith("whatsapp:") else number


def send_sms(to: str, body: str) -> dict:
    """Send plain SMS. Returns sid or error."""
    if not _client:
        return {"status": "skipped", "reason": "Twilio not configured"}
    try:
        msg = _client.messages.create(body=body, from_=_FROM, to=to)
        return {"status": "sent", "sid": msg.sid}
    except Exception as e:
        return {"status": "error", "reason": str(e)}


def send_whatsapp(to: str, body: str) -> dict:
    """Send WhatsApp message via Twilio Sandbox."""
    if not _client:
        return {"status": "skipped", "reason": "Twilio not configured"}
    try:
        msg = _client.messages.create(
            body=body,
            from_=_whatsapp(_FROM),
            to=_whatsapp(to),
        )
        return {"status": "sent", "sid": msg.sid}
    except Exception as e:
        return {"status": "error", "reason": str(e)}


_SANDBOX_FROM = "whatsapp:+14155238886"


def _send_wa_or_sms(to: str, body: str) -> dict:
    """Try WhatsApp sandbox first, fall back to SMS."""
    if not _client:
        return {"status": "skipped", "reason": "Twilio not configured", "body": body}
    try:
        msg = _client.messages.create(
            body=body,
            from_=_SANDBOX_FROM,
            to=f"whatsapp:{to}",
        )
        return {"status": "sent", "channel": "whatsapp", "sid": msg.sid, "body": body}
    except Exception:
        result = send_sms(to, body)
        result["body"] = body
        return result


def send_outreach_message(to_number: str, donor_name: str, blood_group: str, transfusion_date: str) -> dict:
    body = (
        f"🩸 *Blood Warriors Alert*\n\n"
        f"Hi {donor_name}, a patient with *{blood_group}* needs blood urgently "
        f"(transfusion on {transfusion_date}).\n\n"
        f"Can you donate? Reply *YES* to confirm or *NO* to pass.\n\n"
        f"_Blood Warriors Foundation, Hyderabad_"
    )
    return _send_wa_or_sms(to_number, body)


def send_followup_message(to_number: str, donor_name: str, blood_group: str) -> dict:
    body = (
        f"🩸 *Blood Warriors Reminder*\n\n"
        f"Hi {donor_name}, we haven't heard back yet. A *{blood_group}* patient still "
        f"urgently needs your help.\n\n"
        f"Reply *YES* to confirm or *NO* to pass.\n\n"
        f"_Blood Warriors Foundation_"
    )
    return _send_wa_or_sms(to_number, body)


def send_confirmation(to_number: str, donor_name: str) -> dict:
    body = (
        f"✅ *Thank you {donor_name}!*\n\n"
        f"Your donation has been confirmed. Our coordinator will call you shortly "
        f"with collection details.\n\nYou're saving a life. 🙏\n\n"
        f"_Blood Warriors Foundation_"
    )
    return _send_wa_or_sms(to_number, body)


def send_reengage_message(
    to_number: str,
    blood_group: str,
    donor_id: str = "",
    last_donation_date=None,
    inactive_trigger_comment=None,
) -> dict:
    greeting = f"Hi Donor {donor_id}," if donor_id else "Hi there,"

    if last_donation_date:
        from datetime import datetime, timezone
        try:
            if hasattr(last_donation_date, 'strftime'):
                d = last_donation_date
            else:
                d = datetime.fromisoformat(str(last_donation_date))
            months = round((datetime.now(timezone.utc).replace(tzinfo=None) - d.replace(tzinfo=None)).days / 30)
            time_line = f"It's been {months} month{'s' if months != 1 else ''} since your last donation."
        except Exception:
            time_line = "It's been a while since your last donation."
    else:
        time_line = "It's been a while since your last donation."

    parts = [
        f"🩸 *Blood Warriors*\n",
        greeting,
        f"\n{time_line} Right now, a patient with *{blood_group}* in Hyderabad needs you urgently.",
    ]
    if inactive_trigger_comment:
        parts.append(f"\nNote: {inactive_trigger_comment}")
    parts.append("\n\nReply *YES* to schedule or *STOP* to opt out.\n\n_Blood Warriors Foundation_")

    return _send_wa_or_sms(to_number, "".join(parts))

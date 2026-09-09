"""Transactional email for signing invitations and completion notices."""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives

logger = logging.getLogger(__name__)

_WRAPPER = """\
<div style="font-family:'Plus Jakarta Sans',-apple-system,Segoe UI,sans-serif;background:#f7f9fb;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #c4c5d9;border-radius:16px;overflow:hidden">
    <div style="height:4px;background:#0040e0"></div>
    <div style="padding:32px">
      <div style="font-weight:700;font-size:18px;color:#191c1e;margin-bottom:24px">DocuRoute</div>
      {body}
    </div>
    <div style="padding:16px 32px;background:#f2f4f6;color:#515f74;font-size:12px">
      This message was sent by DocuRoute. If you were not expecting it, you can ignore it.
    </div>
  </div>
</div>
"""

_BUTTON = (
    '<a href="{url}" style="display:inline-block;background:#0040e0;color:#ffffff;'
    'text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;'
    'font-size:14px">{label}</a>'
)


def _send(subject: str, to: list[str], text: str, html_body: str) -> bool:
    recipients = [address for address in to if address]
    if not recipients:
        return False
    try:
        message = EmailMultiAlternatives(
            subject=subject,
            body=text,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=recipients,
        )
        message.attach_alternative(_WRAPPER.format(body=html_body), "text/html")
        message.send(fail_silently=False)
        return True
    except Exception:
        # A mail outage must not roll back a completed signature.
        logger.exception("Failed to send %r to %s", subject, recipients)
        return False


def send_signing_invitation(*, recipient, document, sign_url: str, sender_name: str, message: str = "") -> bool:
    subject = f"{sender_name} requests your signature: {document.title}"
    note = (
        f'<p style="color:#434656;font-size:14px;line-height:22px;background:#f2f4f6;'
        f'border-left:3px solid #0040e0;padding:12px 16px;border-radius:4px">{message}</p>'
        if message
        else ""
    )
    html = f"""
      <h1 style="font-size:22px;color:#191c1e;margin:0 0 12px">Your signature is requested</h1>
      <p style="color:#515f74;font-size:14px;line-height:22px;margin:0 0 8px">
        Hi {recipient.name or recipient.email}, <strong>{sender_name}</strong> has routed
        <strong>{document.title}</strong> to you as step {recipient.order + 1}.
      </p>
      {note}
      <p style="margin:24px 0">{_BUTTON.format(url=sign_url, label="Review &amp; sign")}</p>
      <p style="color:#747688;font-size:12px;line-height:18px;margin:0">
        This is a single-use secure link tied to your email address. It expires automatically.
      </p>
    """
    text = (
        f"{sender_name} has requested your signature on {document.title}.\n\n"
        f"Open your secure link: {sign_url}\n\nThe link expires automatically."
    )
    return _send(subject, [recipient.email], text, html)


def send_completion_notice(*, emails, document, download_url: str, final_hash: str) -> bool:
    subject = f"Executed: {document.title}"
    html = f"""
      <h1 style="font-size:22px;color:#191c1e;margin:0 0 12px">All parties have signed</h1>
      <p style="color:#515f74;font-size:14px;line-height:22px;margin:0 0 8px">
        <strong>{document.title}</strong> is fully executed. The attached copy is watermarked
        and carries a certificate of completion with the full audit chain.
      </p>
      <p style="margin:24px 0">{_BUTTON.format(url=download_url, label="Download executed PDF")}</p>
      <p style="color:#747688;font-size:12px;margin:0">SHA-256</p>
      <p style="color:#434656;font-family:ui-monospace,Menlo,monospace;font-size:11px;word-break:break-all;margin:4px 0 0">
        {final_hash}
      </p>
    """
    text = (
        f"{document.title} is fully executed.\n\nDownload: {download_url}\n\nSHA-256: {final_hash}"
    )
    return _send(subject, list(emails), text, html)


def send_declined_notice(*, emails, document, recipient_name: str, reason: str) -> bool:
    subject = f"Declined: {document.title}"
    html = f"""
      <h1 style="font-size:22px;color:#191c1e;margin:0 0 12px">A signer declined</h1>
      <p style="color:#515f74;font-size:14px;line-height:22px;margin:0">
        <strong>{recipient_name}</strong> declined to sign <strong>{document.title}</strong>.
        The routing has been halted and no further invitations were sent.
      </p>
      <p style="color:#434656;font-size:14px;background:#ffdad6;border-radius:8px;padding:12px 16px">
        {reason or "No reason provided."}
      </p>
    """
    text = f"{recipient_name} declined to sign {document.title}.\nReason: {reason or 'none given'}"
    return _send(subject, list(emails), text, html)

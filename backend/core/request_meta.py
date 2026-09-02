def client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "") or ""


def user_agent(request) -> str:
    return (request.META.get("HTTP_USER_AGENT") or "")[:500]

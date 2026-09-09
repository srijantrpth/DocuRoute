from rest_framework.views import exception_handler


def docuroute_exception_handler(exc, context):
    """Normalise DRF errors to `{"detail": ..., "errors": {...}}`."""
    response = exception_handler(exc, context)
    if response is None:
        return None

    data = response.data
    if isinstance(data, dict) and "detail" in data and len(data) == 1:
        response.data = {"detail": str(data["detail"]), "errors": {}}
    elif isinstance(data, dict):
        response.data = {"detail": "Validation failed.", "errors": data}
    else:
        response.data = {"detail": "Request failed.", "errors": {"non_field_errors": data}}
    return response

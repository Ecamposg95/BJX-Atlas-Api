"""State machines de dominio."""


class InvalidTransition(Exception):
    def __init__(self, code: str, detail: dict):
        self.code = code
        self.detail = detail
        super().__init__(code)


class Forbidden(Exception):
    def __init__(self, code: str, detail: dict):
        self.code = code
        self.detail = detail
        super().__init__(code)


__all__ = ["InvalidTransition", "Forbidden"]

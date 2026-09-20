class SimError(ValueError):
    """Any problem caused by the caller's input (bad CSV, bad payload).

    The API layer turns these into HTTP 422 responses with a readable message.
    """


class StatementError(SimError):
    pass


class SimulationError(SimError):
    pass

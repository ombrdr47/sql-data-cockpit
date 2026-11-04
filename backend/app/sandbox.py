"""Generated Python execution is disabled until an OS-isolated worker is available."""
class SandboxTimeoutError(Exception):
    pass

class SandboxSecurityError(Exception):
    pass

def run_code_in_sandbox(code, data, timeout=12):
    raise SandboxSecurityError("Generated Python execution is disabled.")

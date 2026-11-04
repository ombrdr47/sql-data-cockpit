"""Validate every resolved address and pin each outbound database connection."""
import asyncio
import ipaddress
import socket

from fastapi import HTTPException


def require_public_address(value: str) -> str:
    address = ipaddress.ip_address(value.split('%')[0])
    mapped = getattr(address, 'ipv4_mapped', None)
    if ('%' in value or not address.is_global or address.is_multicast or address.is_reserved
            or address.is_unspecified or (mapped is not None and not mapped.is_global)):
        raise HTTPException(422, 'Database hosts must resolve exclusively to public IP addresses.')
    return str(address)


async def resolve_public_addresses(host: str, port: int = 5432) -> list[str]:
    if host.lower().rstrip('.') in {'localhost', 'host.docker.internal', 'gateway.docker.internal'}:
        raise HTTPException(422, 'Internal database hosts are not allowed.')
    try:
        ipaddress.ip_address(host.split('%')[0])
    except ValueError:
        try:
            records = await asyncio.wait_for(asyncio.get_running_loop().getaddrinfo(
                host, port, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM), timeout=5)
        except (OSError, asyncio.TimeoutError) as exc:
            raise HTTPException(422, 'Database hostname could not be resolved.') from exc
        addresses = list(dict.fromkeys(require_public_address(r[4][0]) for r in records))
        if not addresses:
            raise HTTPException(422, 'Database hostname has no usable addresses.')
        return addresses
    return [require_public_address(host)]


async def assert_not_internal(host: str) -> None:
    await resolve_public_addresses(host)

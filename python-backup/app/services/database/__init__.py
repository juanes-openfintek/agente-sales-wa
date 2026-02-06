# Database abstraction layer
from .base import DatabaseBackend
from .convex_client_native import ConvexBackend  # Usando cliente oficial convex-py
from .supabase_client import SupabaseBackend

__all__ = ["DatabaseBackend", "ConvexBackend", "SupabaseBackend"]

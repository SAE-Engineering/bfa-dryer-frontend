import asyncio
import logging
from pymodbus.client import AsyncModbusTcpClient
from pymodbus.exceptions import ModbusException

logger = logging.getLogger(__name__)


class ModbusClient:
    def __init__(self, host: str, port: int = 502, unit_id: int = 1):
        self.host = host
        self.port = port
        self.unit_id = unit_id
        self.client = AsyncModbusTcpClient(host=host, port=port)
        self.is_connected = False

    async def connect(self):
        try:
            await self.client.connect()
            self.is_connected = True
            logger.info(f"Connected to PLC at {self.host}:{self.port}")
        except Exception as e:
            logger.error(f"Failed to connect to PLC: {e}")
            self.is_connected = False

    async def close(self):
        if self.client:
            self.client.close()
            self.is_connected = False
            logger.info("Disconnected from PLC")

    async def read_coils(self, address: int, count: int = 1):
        """Read coils (digital outputs) from PLC"""
        try:
            result = await self.client.read_coils(address, count, self.unit_id)
            if result.isError():
                logger.error(f"Error reading coils: {result}")
                return None
            return result.bits
        except ModbusException as e:
            logger.error(f"Modbus error reading coils: {e}")
            return None

    async def read_holding_registers(self, address: int, count: int = 1):
        """Read holding registers (analog values) from PLC"""
        try:
            result = await self.client.read_holding_registers(
                address, count, self.unit_id
            )
            if result.isError():
                logger.error(f"Error reading registers: {result}")
                return None
            return result.registers
        except ModbusException as e:
            logger.error(f"Modbus error reading registers: {e}")
            return None

    async def write_coil(self, address: int, value: bool):
        """Write a single coil (digital output) to PLC"""
        try:
            result = await self.client.write_coil(address, value, self.unit_id)
            if result.isError():
                logger.error(f"Error writing coil: {result}")
                return False
            return True
        except ModbusException as e:
            logger.error(f"Modbus error writing coil: {e}")
            return False

    async def write_register(self, address: int, value: int):
        """Write a single holding register (analog value) to PLC"""
        try:
            result = await self.client.write_register(address, value, self.unit_id)
            if result.isError():
                logger.error(f"Error writing register: {result}")
                return False
            return True
        except ModbusException as e:
            logger.error(f"Modbus error writing register: {e}")
            return False

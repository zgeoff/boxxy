import { bindDrivers } from '@wringer/core';
import { http } from '@wringer/http';
import { mcp } from '@wringer/mcp';

// The helpers that type an action or a command for the drivers of the verify registry
export const defineVerify = bindDrivers([http({}), mcp({})] as const);

"use client";

import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ basePath: "/api/admin/auth", plugins: [twoFactorClient()] });

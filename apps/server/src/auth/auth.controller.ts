import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt.guard";
import { LoginSchema, RegisterSchema } from "./dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  async register(@Body() body: unknown) {
    const dto = RegisterSchema.parse(body);
    return await this.auth.register(dto);
  }

  @Post("login")
  async login(@Body() body: unknown) {
    const dto = LoginSchema.parse(body);
    return await this.auth.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: { user?: unknown }) {
    // user is attached by JwtStrategy.validate()
    const schema = z.object({ userId: z.string(), username: z.string() });
    return schema.parse(req.user);
  }
}


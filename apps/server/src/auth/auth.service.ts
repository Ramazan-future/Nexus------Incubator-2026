import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../db/prisma.service";
import type { LoginDto, RegisterDto } from "./dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        passwordHash,
      },
      select: { id: true, username: true, email: true },
    });

    const accessToken = await this.signToken(user.id, user.username);
    return { user, accessToken };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (!user?.passwordHash) throw new UnauthorizedException("Invalid credentials");

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    const accessToken = await this.signToken(user.id, user.username);
    return { user: { id: user.id, username: user.username, email: user.email }, accessToken };
  }

  private async signToken(userId: string, username: string) {
    return await this.jwt.signAsync(
      { sub: userId, username },
      { expiresIn: "7d" },
    );
  }
}


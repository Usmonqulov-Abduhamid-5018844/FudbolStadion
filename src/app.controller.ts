import { Controller, Get } from '@nestjs/common';

@Controller('')
export class AppController {
  @Get()
  findAll() {
    return "Bu telegram bo'tning default sakifasi";
  }
}

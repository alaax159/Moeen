import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { RxNormService } from './rxnorm.service';

@Module({
  imports: [HttpModule],
  providers: [RxNormService],
  exports: [RxNormService],
})
export class RxNormModule {}

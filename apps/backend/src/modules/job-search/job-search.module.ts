import { Module } from '@nestjs/common';
import { JobSearchService } from './job-search.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [JobSearchService],
  exports: [JobSearchService],
})
export class JobSearchModule {}

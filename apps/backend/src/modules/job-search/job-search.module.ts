import { Module } from '@nestjs/common';
import { JobSearchService } from './job-search.service';

@Module({
  providers: [JobSearchService],
  exports: [JobSearchService],
})
export class JobSearchModule {}


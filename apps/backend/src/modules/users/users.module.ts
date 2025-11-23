import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { HomesModule } from '../homes/homes.module';
import { PeopleModule } from '../people/people.module';
import { Home } from '../homes/entities/home.entity';
import { Person } from '../people/entities/person.entity';
import { ClaudeModule } from '../claude/claude.module';
import { UserProductsModule } from '../user-products/user-products.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Home, Person]),
    HomesModule,
    PeopleModule,
    ClaudeModule,
    forwardRef(() => UserProductsModule),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}

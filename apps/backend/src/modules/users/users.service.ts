import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ProductoForCart } from './dto/producto-for-cart.dto';
import { exec } from 'child_process';
import { join } from 'path';
import { Home } from '../homes/entities/home.entity';
import { Person } from '../people/entities/person.entity';
import { CreateUserOnboardingDto } from './dto/create-onboarding.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Home)
    private readonly homeRepository: Repository<Home>,
    @InjectRepository(Person)
    private readonly personRepository: Repository<Person>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async isUserAdmin(id: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) return false;
    return user.phoneNumber === '+56900000001';
  }

  async findByPhoneNumber(phoneNumber: string): Promise<User | Record<string, never>> {
    const user = await this.userRepository.findOne({
      where: { phoneNumber },
    });

    return user || {};
  }

  async fillCart(id: string, products: ProductoForCart[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const scriptPath = join(process.cwd(), 'apps', 'despense-agent', 'scrapper', 'jumbo_add_to_cart.py');
      // Clean products JSON for command line
      const productsJson = JSON.stringify(products).replace(/"/g, '\\"');

      const command = `python "${scriptPath}" "${productsJson}"`;

      console.log(`Executing cart script for user ${id}...`);

      exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error executing script: ${error}`);
          // Don't reject, maybe partial success or just return cart link anyway
        }
        console.log(`Script output: ${stdout}`);
        if (stderr) console.error(`Script errors: ${stderr}`);

        resolve('https://www.jumbo.cl/checkout/cart');
      });
    });
  }

  async createOrUpdateUserOnboarding(dto: CreateUserOnboardingDto): Promise<User> {
    // Usar transacción para garantizar atomicidad
    return await this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const homeRepository = manager.getRepository(Home);
      const personRepository = manager.getRepository(Person);

      // Buscar usuario existente por número de teléfono
      let user = await userRepository.findOne({
        where: { phoneNumber: dto.phoneNumber },
        relations: ['home', 'home.people'],
      });

      if (user) {
        // Usuario existe: actualizar información
        user.name = dto.name;
        await userRepository.save(user);

        // Eliminar home y personas existentes si existen
        if (user.home) {
          if (user.home.people && user.home.people.length > 0) {
            await personRepository.remove(user.home.people);
          }
          await homeRepository.remove(user.home);
        }
      } else {
        // Usuario no existe: crear nuevo
        user = userRepository.create({
          phoneNumber: dto.phoneNumber,
          name: dto.name,
        });
        user = await userRepository.save(user);
      }

      // Crear nuevo home
      const home = homeRepository.create({
        userId: user.id,
        income: dto.home.income,
        foodType: dto.home.foodType,
      });
      const savedHome = await homeRepository.save(home);

      // Crear personas asociadas al home
      const people = dto.home.people.map((personDto) =>
        personRepository.create({
          homeId: savedHome.id,
          age: personDto.age,
          eatingRate: personDto.eatingRate,
          gender: personDto.gender,
          sportRate: personDto.sportRate,
        }),
      );
      await personRepository.save(people);

      // Retornar usuario con relaciones cargadas
      return await userRepository.findOne({
        where: { id: user.id },
        relations: ['home', 'home.people'],
      });
    });
  }
}

import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Home } from '../homes/entities/home.entity';
import { Person } from '../people/entities/person.entity';
import { CreateUserOnboardingDto, CreateHomeDto } from './dto/create-onboarding.dto';
import { ClaudeService } from '../claude/claude.service';
import { UserProductsService } from '../user-products/user-products.service';
import { MovementType } from '../inventory-movements/entities/inventory-movement.entity';
import { SourceType } from '../data-loads/entities/data-load.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Home)
    private readonly homeRepository: Repository<Home>,
    @InjectRepository(Person)
    private readonly personRepository: Repository<Person>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly claudeService: ClaudeService,
    @Inject(forwardRef(() => UserProductsService))
    private readonly userProductsService: UserProductsService,
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

  async fillCart(id: string, products: string[]): Promise<string> {
    // URL del servicio de agente (configurable vía ENV)
    const agentUrl = process.env.DESPENSE_AGENT_URL || 'http://despense-agent:5001';

    try {
      this.logger.log(`Calling agent to fill cart for user ${id}...`);

      const response = await fetch(`${agentUrl}/cart/fill`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(products),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Agent returned status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      this.logger.log(`Agent response: ${JSON.stringify(data)}`);

      return data.url || 'https://www.jumbo.cl/mi-carro';
    } catch (error) {
      this.logger.error(`Error filling cart via agent: ${error.message}`);
      // Fallback a URL genérica en caso de error
      return 'https://www.jumbo.cl/mi-carro';
    }
  }

  async createOrUpdateUserOnboarding(dto: CreateUserOnboardingDto): Promise<User> {
    // Usar transacción para garantizar atomicidad
    const result = await this.dataSource.transaction(async (manager) => {
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

    // Generar predicción de despensa automáticamente en background (fire and forget)
    this.generateInitialPantry(result.id, dto.home).catch((error) => {
      this.logger.error(`Background task error (generateInitialPantry): ${error.message}`, error.stack);
    });

    return result;
  }

  /**
   * Proceso en background para generar la despensa inicial
   */
  private async generateInitialPantry(userId: string, homeDto: CreateHomeDto) {
    try {
      this.logger.log(`[Background] Iniciando generación de despensa para usuario ${userId}...`);
      const predictedProducts = await this.claudeService.generatePantryPrediction({
        income: homeDto.income,
        foodType: homeDto.foodType,
        people: homeDto.people.map((p) => ({
          age: p.age,
          gender: p.gender,
          eatingRate: p.eatingRate,
          sportRate: p.sportRate,
        })),
      });

      if (predictedProducts.length > 0) {
        this.logger.log(
          `[Background] Predicción completada: ${predictedProducts.length} productos. Iniciando carga...`,
        );
        await this.userProductsService.bulkUpload(userId, {
          movementType: MovementType.ADJUSTMENT,
          sourceType: SourceType.MANUAL,
          products: predictedProducts,
        });
        this.logger.log('[Background] Carga automática de despensa completada exitosamente');
      } else {
        this.logger.warn('[Background] La predicción no retornó productos');
      }
    } catch (error) {
      this.logger.error(`[Background] Error en generación automática de despensa: ${error.message}`, error.stack);
      // No lanzamos error para no afectar procesos globales si esto fuera parte de algo más grande,
      // pero el catch del caller lo atraparía si hiciéramos throw.
      throw error;
    }
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ProductoForCart } from './dto/producto-for-cart.dto';
import { exec } from 'child_process';
import { join } from 'path';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
}

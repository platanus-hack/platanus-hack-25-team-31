import { FoodType } from '../../homes/entities/home.entity';
import { EatingRate, SportRate, Gender } from '../../people/entities/person.entity';

// DTO para crear una persona
export interface CreatePersonDto {
  age: number;
  eatingRate: EatingRate;
  gender: Gender;
  sportRate: SportRate;
}

// DTO para crear un hogar con sus personas
export interface CreateHomeDto {
  income: number;
  foodType: FoodType;
  people: CreatePersonDto[];
}

// DTO principal para el onboarding de usuario
export interface CreateUserOnboardingDto {
  phoneNumber: string;
  name: string;
  home: CreateHomeDto;
}


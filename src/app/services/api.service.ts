import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly BASE_URL = environment.baseUrl;
  private readonly startYear = 2020;
  private largeMeasures = ['26','29','31','33','06','21'];
  
  constructor(private http: HttpClient) { }

  async getStatistics(id: string): Promise<any> {
    try {
      if (this.largeMeasures.includes(id)) {
        return await this.getStatisticsByYears(id);
      }
      return await firstValueFrom(this.http.get(`${this.BASE_URL}${id}`));
    } catch (error) {
      console.error(`[ApiService] getStatistics failed for "${id}":`, error);
      throw error;
    }
  }
  
  async getStatisticsByYears(id: string): Promise<any> {
    const lastYear = new Date().getFullYear() - 1;
    const years = Array.from({ length: lastYear - this.startYear + 1 }, (_, i) => this.startYear + i);

    try {
      const requests = years.map(year =>
        firstValueFrom(this.http.get(`${this.BASE_URL}${id}/${year}`))
          .catch(error => {
            console.error(`[ApiService] getStatistics failed for "${id}/${year}":`, error);
            return null;
          })
      );

      const results = await Promise.all(requests);
      return results.reduce((acc: any[], curr) => curr ? acc.concat(curr) : acc, []);
    } catch (error) {
      console.error(`[ApiService] getStatistics failed for "${id}":`, error);
      throw error;
    }
  }
}
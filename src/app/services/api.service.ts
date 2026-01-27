import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private readonly BASE_URL = environment.baseUrl;

  constructor(private http: HttpClient) { }

  getStatistics(id: string): Promise<any> {
    return firstValueFrom(this.http.get(`${this.BASE_URL}${id}`));
  }
}
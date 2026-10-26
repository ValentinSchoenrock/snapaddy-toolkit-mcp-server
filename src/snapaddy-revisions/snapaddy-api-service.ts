import axios, { AxiosRequestConfig, AxiosResponse, Method } from 'axios';

import { Environment } from '../types/index.js';
import { InvalidSettingsError } from '../utils/index.js';



export class SnapADDYAPIService {

  protected getBaseUrl(env: Environment): string {
    // const devName = workspace.getConfiguration('smtk.snapaddy').get('token.devName');
    if (env === Environment.DEV /*&& !devName*/) {
      throw new InvalidSettingsError('No name for dev environment');
    }
    const urlMap = {
      'production': 'https://api.snapaddy.com',
      'staging': 'https://api.stg.snapaddy.com/',
      // 'dev': `https://api-${devName}.dev.snapaddy.com`
    };
    return urlMap[env];
  }



  protected getApiToken(env: Environment): string {
    return 'AhDq3867MTund2NuHGrHdsM7nHmo31qvcYN37Nug';
  }



  public makeRequest<T, K = unknown>(
    url: string,
    method: Method,
    env: Environment,
    payload?: K,
  ): Promise<AxiosResponse<T>> {
    const options: AxiosRequestConfig = {
      baseURL: this.getBaseUrl(env),
      url,
      method,
      headers: {
        'x-api-token': this.getApiToken(env)
      },
      data: payload
    };
    return axios.request(options);
  }



  public makeWorkflowRequest<T, K = unknown>(
    url: string,
    method: Method,
    env: Environment,
    payload?: K,
  ): Promise<AxiosResponse<T>> {
    const options: AxiosRequestConfig = {
      baseURL: 'https://backend.snapaddy.com/',
      url,
      method,
      headers: {
        'x-api-key': this.getApiToken(env)
      },
      data: payload
    };
    return axios.request(options);
  }


  public makeBackendRequest<T, K = unknown>(
    url: string,
    method: Method,
    env: Environment,
    payload?: K,
  ): Promise<AxiosResponse<T>> {
    const options: AxiosRequestConfig = {
      baseURL: this.getBaseUrl(env),
      url,
      method,
      headers: {
        // DONT EVER COMMIT
        'x-Access-token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiOTBhcWd6QlJRNHpuUjM0WiIsInVzZXJuYW1lIjoidi5zY2hvZW5yb2NrQHNuYXBhZGR5LmNvbSIsImlhdCI6MTc2ODM3NzUwOSwiZXhwIjoxNzc2MTUzNTA5fQ.zysdSW73dBBezETkKgHbYvdX8gwvfjmNN03EilWWoiQ' //this.getApiToken(env)
      },
      data: payload
    };
    return axios.request(options);
  }
}
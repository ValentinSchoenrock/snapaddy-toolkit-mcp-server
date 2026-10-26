export enum Environment {
  PRODUCTION = 'production',
  STAGING = 'staging',
  DEV = 'dev'
}

export interface EnvConfig {
  key: Environment;
  name: string;
  token: string;
}

export enum ErrorSource {
  GET_REVISIONS = 'GetRevisions',
  SET_ACTIVE = 'SetActive',
  APPROVE = 'Approve',
  CREATE_NEW = 'CreateNew',
  DUPLICATE = 'Duplicate',
  UPDATE = 'Update',
  DELETE = 'Delete',
  SET_USER = 'SetUser'
}

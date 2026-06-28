// 最小 pg 类型声明（项目未装 @types/pg；只声明本项目用到的部分，零运行时依赖）。
declare module 'pg' {
  export interface QueryResult<R = any> {
    rows: R[];
    rowCount: number;
  }
  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
    keepAlive?: boolean;
    statement_timeout?: number;
  }
  // 单个连接（事务用）：从 Pool.connect() 取出，用完 release() 归还。
  export interface PoolClient {
    query<R = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
    release(): void;
  }
  export class Pool {
    constructor(config?: PoolConfig);
    query<R = any>(text: string, params?: any[]): Promise<QueryResult<R>>;
    connect(): Promise<PoolClient>;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
    end(): Promise<void>;
  }
}

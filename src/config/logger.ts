import pino from 'pino';

const transport = pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname,req,res,responseTime',
  },
});

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info', 
  },
  process.env.NODE_ENV !== 'production' ? transport : undefined
);

export default logger;

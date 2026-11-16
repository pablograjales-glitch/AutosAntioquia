import readline from 'readline';
import dotenv from 'dotenv';
import path from 'path';
import { pool } from '../config/db';
import { AuthService } from '../services/authService';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function preguntar(pregunta: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(pregunta, value => { rl.close(); resolve(value.trim()); }));
}

function preguntarClave(): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Ejecuta este comando en una terminal interactiva.'));
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const stdin = process.stdin;
    const finish = (error?: Error) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false); stdin.pause(); process.stdout.write('\n');
      error ? reject(error) : resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') return finish(new Error('Operación cancelada.'));
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u007f' || char === '\b') { value = value.slice(0, -1); continue; }
        if (char >= ' ') { value += char; process.stdout.write('*'); }
      }
    };
    process.stdout.write('Contraseña (no se mostrará): ');
    stdin.setRawMode(true); stdin.resume(); stdin.on('data', onData);
  });
}

async function main() {
  const nombreUsuario = await preguntar('Nombre de usuario administrador: ');
  const nombreCompleto = await preguntar('Nombre completo: ');
  const password = await preguntarClave();
  const cuenta = await new AuthService().crearCuenta({ nombreUsuario, nombreCompleto, password, rol: 'ADMINISTRADOR' });
  console.log(`Cuenta administradora creada: ${cuenta.nombre_usuario}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());

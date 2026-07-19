import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { logoutAgent } from '../mindcraft/mindserver.js';

const init_agent_path = fileURLToPath(new URL('./init_agent.js', import.meta.url));

export class AgentProcess {
    constructor(name, port) {
        this.name = name;
        this.port = port;
        this._restartCount = 0;
    }

    start(load_memory=false, init_message=null, count_id=0) {
        this.count_id = count_id;
        this.running = true;

        let args = [init_agent_path, this.name];
        args.push('-n', this.name);
        args.push('-c', count_id);
        if (load_memory)
            args.push('-l', load_memory);
        if (init_message)
            args.push('-m', init_message);
        args.push('-p', this.port);

        const agentProcess = spawn(process.execPath, args, {
            stdio: 'inherit',
            stderr: 'inherit',
        });

        const onStart = Date.now();
        agentProcess.on('exit', (code, signal) => {
            const uptime = Date.now() - onStart;
            console.log(`Agent process exited with code ${code} and signal ${signal} (uptime: ${uptime}ms)`);
            this.running = false;
            logoutAgent(this.name);

            if (code > 1) {
                console.log(`Ending task`);
                process.exit(code);
            }

            if (code !== 0 && signal !== 'SIGINT') {
                this._scheduleRestart(uptime, load_memory, count_id);
            }
        });

        agentProcess.on('error', (err) => {
            console.error('Agent process error:', err);
        });

        this.process = agentProcess;
    }

    _scheduleRestart(uptimeMs, load_memory, count_id) {
        // Exponential backoff: 3s → 6s → 12s → 30s (capped)
        this._restartCount = Math.min(this._restartCount + 1, 5);
        const delay = Math.min(3000 * Math.pow(2, this._restartCount - 1), 30000);

        // If the agent ran at least 5 seconds, restart sooner
        const fastRestart = uptimeMs >= 5000;
        const actualDelay = fastRestart ? 3000 : delay;

        if (fastRestart) this._restartCount = 1; // reset counter on healthy runs

        console.log(`Reconnecting in ${actualDelay}ms (attempt ${this._restartCount})…`);
        setTimeout(() => {
            console.log('Restarting agent…');
            this.start(true, 'Agent process restarted.', count_id, this.port);
        }, actualDelay);
    }

    stop() {
        if (!this.running) return;
        this.process.kill('SIGINT');
    }

    forceRestart() {
        if (this.running && this.process && !this.process.killed) {
            console.log(`Agent process for ${this.name} is still running. Attempting to force restart.`);
            
            const restartTimeout = setTimeout(() => {
                console.warn(`Agent ${this.name} did not stop in time. It might be stuck.`);
            }, 5000); // 5 seconds to exit

            this.process.once('exit', () => {
                 clearTimeout(restartTimeout);
                 console.log(`Stopped hanging agent ${this.name}. Now restarting.`);
                 this.start(true, 'Agent process restarted.', this.count_id);
            });
            this.stop(); // sends SIGINT
        } else {
             this.start(true, 'Agent process restarted.', this.count_id);
        }
    }
}
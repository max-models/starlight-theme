"""An IPython kernel that runs every cell on several MPI ranks.

``notebooks.py execute`` launches this, when ``mpiRanks`` > 1, as
``mpiexec -n <nranks> python mpi_kernel.py -f <connection_file>`` so the notebooks execute under
real MPI: a notebook's ``if rank == 0:`` plots then show what several ranks did (e.g. the block
boundaries of a decomposition) instead of a single-rank run.

Only rank 0 is a real Jupyter kernel talking to the notebook client; before running a
cell, it broadcasts the cell's source to the other ranks over ``COMM_WORLD``, so every
rank reaches a collective call (an ``Alltoallv``, a ``bcast``, ...) in the same cell at
the same time. The other ranks run the code silently and keep no notebook output, so
notebooks guard their own output with ``if rank == 0:``.
"""

from __future__ import annotations

from mpi4py import MPI

COMM = MPI.COMM_WORLD


def _run_worker() -> None:
    import os
    import sys

    # Only rank 0's kernel is captured as notebook output; keep the others' stdout/stderr
    # (a guide that forgets its own `if rank == 0:` guard, a library warning) off the console.
    devnull = open(os.devnull, "w")
    sys.stdout = sys.stderr = devnull

    namespace: dict[str, object] = {}
    while True:
        code = COMM.bcast(None, root=0)
        if code is None:
            return
        try:
            exec(compile(code, "<mpi-cell>", "exec"), namespace)
        except BaseException:
            # rank 0's kernel reports the error back to the notebook; every rank must
            # still reach the next broadcast, or a later collective call hangs.
            pass


def _run_kernel() -> None:
    from ipykernel.ipkernel import IPythonKernel
    from ipykernel.kernelapp import IPKernelApp

    class MPIKernel(IPythonKernel):
        async def do_execute(self, code, *args, **kwargs):
            COMM.bcast(code, root=0)
            return await super().do_execute(code, *args, **kwargs)

    class MPIKernelApp(IPKernelApp):
        kernel_class = MPIKernel

    try:
        MPIKernelApp.launch_instance()
    finally:
        COMM.bcast(None, root=0)  # release the other ranks, however the kernel exited


def main() -> None:
    if COMM.Get_rank() == 0:
        _run_kernel()
    else:
        _run_worker()


if __name__ == "__main__":
    main()

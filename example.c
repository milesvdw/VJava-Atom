int dummy() {
      x = 10;

#ifdef DEC
      x = x - 1;
#else
      x = x + 1;
#endif

#ifdef MULT
#ifdef BIG
      x = x * 5;
#else
      x = x * 2;
#endif

#else
      x = x / 5;
#endif

      return x;


#ifdef DEC
new dimension
#endif

  }

1
2
3
4
#ifndef BIG
new dimension
#endif
6
7
8

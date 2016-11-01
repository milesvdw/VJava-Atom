int do_interesting_math(int n) {
    int x = 0;
    int y = 1;
    while(x < n) {

      #ifdef B
        #ifdef C
        print("X: %d\nY: %d");
        #else
        print("working...");
        #endif
      #endif

      #ifdef A
      y = y * (n-x);
      #else
      y = y * n;
      #endif


      #ifndef B
        #ifdef C
        print("X: %d\nY: %d");
        #else
        print("working...");
        #endif
      #endif
      x++;
    }
}

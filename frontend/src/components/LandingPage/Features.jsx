function Features() {
  const features = [
    {
      title: "AI-Powered Matching",
      icon: "/assets/features/1.svg",
    },
    {
      title: "Credit-Based System",
      icon: "/assets/features/2.svg",
    },
    {
      title: "Secure & Verified",
      icon: "/assets/features/3.svg",
    },
    {
      // Was "Global Community". Every user, every teacher and the payment
      // provider are in Pakistan, and the rest of the site says so - a claim
      // the product doesn't meet doesn't belong on the front page.
      title: "Learners Across Pakistan",
      icon: "/assets/features/4.svg",
    },
    {
      title: "Smart Scheduling",
      icon: "/assets/features/5.svg",
    },
    {
      title: "Integrated Chat",
      icon: "/assets/features/6.svg",
    },
  ];

  return (
    <section className="py-20 bg-white font-family-poppins">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl md:text-5xl font-medium text-black mb-4">
            Everything You Need to Learn & Teach
          </h2>
          <p className="text-lg  font-medium text-black max-w-2xl mx-auto">
            A complete platform designed to make skill exchange seamless, secure, and rewarding.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-light-bg py-12  rounded-lg border border-teal/20 flex flex-col items-center text-center"
            >
              {/* Icon */}
              <div className="w-16 h-16 mb-4 flex items-center justify-center">
                <img
                  src={feature.icon}
                  alt={feature.title}
                  className="w-full h-full"
                />
              </div>

              <h3 className=" text-xl font-medium text-dark-blue mb-2">
                {feature.title}
              </h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Features;
